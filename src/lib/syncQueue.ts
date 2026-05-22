import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { getDatabase } from './offlineStorage';
import { toast } from 'sonner';

const isNative = Capacitor.isNativePlatform();
const WEB_QUEUE_KEY = 'al_sync_queue';

export interface QueuedMutation {
  id: string;
  table_name: string;
  operation: 'insert' | 'update' | 'soft_delete';
  payload: any;
  farm_id: string;
  created_at: string;
  retry_count: number;
}

// Helper: load web queue from localStorage
function getWebQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(WEB_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to parse web sync queue:', err);
    return [];
  }
}

// Helper: save web queue to localStorage
function saveWebQueue(queue: QueuedMutation[]) {
  try {
    localStorage.setItem(WEB_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to save web sync queue:', err);
  }
}

// Helper: check if a Supabase error is transient (network failure)
function isNetworkError(error: any) {
  if (!error) return false;
  if (error.status === 0 || error.status === null || error.status === undefined) return true;
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('load failed')) {
    return true;
  }
  return false;
}

export const syncQueue = {
  /**
   * Enqueues a new mutation to be processed when online.
   */
  enqueueMutation: async (
    tableName: string,
    operation: 'insert' | 'update' | 'soft_delete',
    payload: any,
    farmId: string
  ): Promise<void> => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          await db.run(
            `INSERT INTO sync_queue (id, table_name, operation, payload, farm_id, created_at, retry_count)
             VALUES (?, ?, ?, ?, ?, ?, 0);`,
            [id, tableName, operation, JSON.stringify(payload), farmId, now]
          );
        }
      } catch (err) {
        console.error('Failed to enqueue native mutation:', err);
      }
    } else {
      const queue = getWebQueue();
      queue.push({
        id,
        table_name: tableName,
        operation,
        payload,
        farm_id: farmId,
        created_at: now,
        retry_count: 0
      });
      saveWebQueue(queue);
    }
  },

  /**
   * Retrieves all pending mutations for a specific farm.
   */
  getQueue: async (farmId: string): Promise<QueuedMutation[]> => {
    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          const res = await db.query(
            'SELECT * FROM sync_queue WHERE farm_id = ? ORDER BY created_at ASC;',
            [farmId]
          );
          if (res.values) {
            return res.values.map((v: any) => ({
              ...v,
              payload: JSON.parse(v.payload)
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch native sync queue:', err);
      }
      return [];
    } else {
      return getWebQueue().filter(item => item.farm_id === farmId);
    }
  },

  /**
   * Removes a mutation from the queue.
   */
  dequeueMutation: async (id: string): Promise<void> => {
    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          await db.run('DELETE FROM sync_queue WHERE id = ?;', [id]);
        }
      } catch (err) {
        console.error('Failed to dequeue native mutation:', err);
      }
    } else {
      const queue = getWebQueue();
      const updated = queue.filter(item => item.id !== id);
      saveWebQueue(updated);
    }
  },

  /**
   * Increments the retry count for a queued mutation.
   */
  incrementRetry: async (id: string, currentRetries: number): Promise<void> => {
    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          await db.run('UPDATE sync_queue SET retry_count = ? WHERE id = ?;', [currentRetries + 1, id]);
        }
      } catch (err) {
        console.error('Failed to update native retry count:', err);
      }
    } else {
      const queue = getWebQueue();
      const idx = queue.findIndex(item => item.id === id);
      if (idx !== -1) {
        queue[idx].retry_count += 1;
        saveWebQueue(queue);
      }
    }
  },

  /**
   * Returns the count of pending mutations for a farm.
   */
  getPendingCount: async (farmId: string): Promise<number> => {
    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          const res = await db.query('SELECT COUNT(*) as count FROM sync_queue WHERE farm_id = ?;', [farmId]);
          if (res.values && res.values.length > 0) {
            return res.values[0].count;
          }
        }
      } catch (err) {
        console.error('Failed to get native pending count:', err);
      }
      return 0;
    } else {
      return getWebQueue().filter(item => item.farm_id === farmId).length;
    }
  },

  /**
   * Replays the queued mutations to Supabase in FIFO order.
   * Returns true if the entire queue was processed, false if paused due to a network error.
   */
  replayQueue: async (farmId: string): Promise<boolean> => {
    const queue = await syncQueue.getQueue(farmId);
    if (queue.length === 0) return true;

    console.log(`Replaying sync queue: ${queue.length} mutations pending.`);
    
    for (const mutation of queue) {
      let error = null;

      try {
        if (mutation.operation === 'insert') {
          // Perform insert
          const { error: err } = await supabase
            .from(mutation.table_name)
            .insert([{ ...mutation.payload, farm_id: farmId }]);
          error = err;
        } else if (mutation.operation === 'update') {
          // Perform update, strip id/farm_id from set payload
          const { farm_id: _f, id: _i, ...payload } = mutation.payload;
          const { error: err } = await supabase
            .from(mutation.table_name)
            .update(payload)
            .eq('id', mutation.payload.id)
            .eq('farm_id', farmId);
          error = err;
        } else if (mutation.operation === 'soft_delete') {
          // Perform soft delete update
          const { error: err } = await supabase
            .from(mutation.table_name)
            .update({ deleted_at: mutation.payload.deleted_at })
            .eq('id', mutation.payload.id)
            .eq('farm_id', farmId);
          error = err;
        }

        if (error) {
          if (isNetworkError(error)) {
            // Transient error: stop queue execution and wait for next connection online event
            console.warn(`Sync queue replay paused due to connection issue:`, error);
            return false;
          } else {
            // Permanent error (e.g. RLS failure, constraint error)
            console.error(`Sync queue permanent mutation failure for ${mutation.table_name}:`, error);
            
            const nextRetries = mutation.retry_count + 1;
            if (nextRetries >= 3) {
              console.warn(`Discarding sync mutation ${mutation.id} after 3 failed attempts.`);
              await syncQueue.dequeueMutation(mutation.id);
            } else {
              await syncQueue.incrementRetry(mutation.id, mutation.retry_count);
              // Stop processing for now, will retry again on next sync trigger
              return false;
            }
          }
        } else {
          // Success: remove mutation from queue
          await syncQueue.dequeueMutation(mutation.id);
        }
      } catch (err) {
        console.error(`Unhandled error during sync queue replay:`, err);
        return false;
      }
    }

    toast.success('Sync complete. All offline changes uploaded.');
    return true;
  }
};
