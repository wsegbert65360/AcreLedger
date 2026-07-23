import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { getDatabase } from './offlineStorage';
import { toast } from 'sonner';
import { encryptData, decryptData, getLocalEncryptionKey } from '@/utils/crypto';

const isNative = Capacitor.isNativePlatform();
const WEB_QUEUE_KEY = 'al_sync_queue';
let webQueuePromise: Promise<void> = Promise.resolve();
const INSERT_QUEUE_SQL = `INSERT INTO sync_queue (id, table_name, operation, payload, farm_id, created_at, retry_count)
  VALUES (?, ?, ?, ?, ?, ?, 0);`;

const ALLOWED_TABLES = new Set([
  'fields', 'bins', 'plant_records', 'spray_records',
  'harvest_records', 'hay_harvest_records', 'custom_spray_records', 'fertilizer_applications',
  'tillage_records', 'grain_movements', 'saved_seeds',
  'fertilizer_recipes', 'spray_recipes',
  'fsa_tract_imports', 'field_clu_assignments',
  'work_requests',
]);

export interface QueuedMutation {
  id: string;
  table_name: string;
  operation: 'insert' | 'update' | 'soft_delete';
  payload: any;
  farm_id: string;
  created_at: string;
  retry_count: number;
}

async function getEncryptionSecret(): Promise<string> {
  return getLocalEncryptionKey();
}

// Helper: load web queue from localStorage
async function getWebQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = localStorage.getItem(WEB_QUEUE_KEY);
    if (!raw) return [];
    const secret = await getEncryptionSecret();
    const decrypted = await decryptData(raw, secret);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Failed to parse web sync queue:', err);
    return [];
  }
}

// Helper: save web queue to localStorage. Rethrows persistence failures so
// callers (enqueueMutation / enqueueMutations) can roll back optimistic state
// instead of silently dropping the mutation.
async function saveWebQueue(queue: QueuedMutation[]) {
  const secret = await getEncryptionSecret();
  const encrypted = await encryptData(JSON.stringify(queue), secret);
  localStorage.setItem(WEB_QUEUE_KEY, encrypted);
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
        if (!db) throw new Error('Offline database unavailable.');
        await db.run(
          INSERT_QUEUE_SQL,
          [id, tableName, operation, JSON.stringify(payload), farmId, now]
        );
      } catch (err) {
        // Rethrow so hooks can roll back optimistic state. Previously this was
        // swallowed, which left the hooks' catch-driven rollback branches as
        // unreachable dead code (the user would see a "saved offline" success
        // toast even though nothing was queued).
        console.error('Failed to enqueue native mutation:', err);
        throw err;
      }
    } else {
      // Serialize writes through webQueuePromise so concurrent enqueues don't
      // clobber each other. Errors propagate (no swallowing .catch) so the
      // hook caller can roll back. Passing `run` as both handlers lets a later
      // enqueue retry after a transient persistence failure without allowing
      // concurrent writes to clobber one another.
      const run = async () => {
        const queue = await getWebQueue();
        queue.push({
          id,
          table_name: tableName,
          operation,
          payload,
          farm_id: farmId,
          created_at: now,
          retry_count: 0
        });
        await saveWebQueue(queue);
      };
      try {
        await (webQueuePromise = webQueuePromise.then(run, run));
      } catch (err) {
        console.error('Failed to serialize web sync queue enqueue:', err);
        throw err;
      }
    }
  },

  /**
   * Atomically enqueue multiple mutations. Used by multi-record offline
   * operations (bulk delete, tract-delete CLU cascade, field-delete CLU
   * cascade) so that a partial persistence failure does not leave some
   * records queued while the hook rolls back its optimistic local state.
   *
   * Web writes the entire batch in one encrypted localStorage update. Native
   * uses SQLite executeSet with a transaction, so both paths are all-or-nothing.
   */
  enqueueMutations: async (
    items: { tableName: string; operation: 'insert' | 'update' | 'soft_delete'; payload: any; farmId: string }[]
  ): Promise<void> => {
    if (items.length === 0) return;
    const now = new Date().toISOString();
    const rows: QueuedMutation[] = items.map(item => ({
      id: crypto.randomUUID(),
      table_name: item.tableName,
      operation: item.operation,
      payload: item.payload,
      farm_id: item.farmId,
      created_at: now,
      retry_count: 0,
    }));

    if (isNative) {
      try {
        const db = await getDatabase();
        if (!db) throw new Error('Offline database unavailable.');
        await db.executeSet(
          rows.map(row => ({
            statement: INSERT_QUEUE_SQL,
            values: [row.id, row.table_name, row.operation, JSON.stringify(row.payload), row.farm_id, row.created_at],
          })),
          true,
        );
      } catch (err) {
        console.error('Failed to enqueue native mutations batch:', err);
        throw err;
      }
    } else {
      const run = async () => {
        const queue = await getWebQueue();
        queue.push(...rows);
        await saveWebQueue(queue);
      };
      try {
        await (webQueuePromise = webQueuePromise.then(run, run));
      } catch (err) {
        console.error('Failed to serialize web sync queue enqueueMutations:', err);
        throw err;
      }
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
      let result: QueuedMutation[] = [];
      await (webQueuePromise = webQueuePromise.then(async () => {
        const queue = await getWebQueue();
        result = queue.filter(item => item.farm_id === farmId);
      }).catch(err => {
        console.error('Failed to serialize web sync queue getQueue:', err);
      }));
      return result;
    }
  },

  /** Removes every queued mutation belonging to a farm (used on sign-out). */
  clearQueue: async (farmId: string): Promise<void> => {
    if (isNative) {
      const db = await getDatabase();
      if (!db) throw new Error('Offline database unavailable.');
      await db.run('DELETE FROM sync_queue WHERE farm_id = ?;', [farmId]);
      return;
    }

    const run = async () => {
      const queue = await getWebQueue();
      await saveWebQueue(queue.filter(item => item.farm_id !== farmId));
    };
    try {
      await (webQueuePromise = webQueuePromise.then(run, run));
    } catch (err) {
      console.error('Failed to clear web sync queue:', err);
      throw err;
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
      await (webQueuePromise = webQueuePromise.then(async () => {
        const queue = await getWebQueue();
        const updated = queue.filter(item => item.id !== id);
        await saveWebQueue(updated);
      }).catch(err => {
        console.error('Failed to serialize web sync queue dequeue:', err);
      }));
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
      await (webQueuePromise = webQueuePromise.then(async () => {
        const queue = await getWebQueue();
        const idx = queue.findIndex(item => item.id === id);
        if (idx !== -1) {
          queue[idx].retry_count += 1;
          await saveWebQueue(queue);
        }
      }).catch(err => {
        console.error('Failed to serialize web sync queue increment retry:', err);
      }));
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
      let result = 0;
      await (webQueuePromise = webQueuePromise.then(async () => {
        const queue = await getWebQueue();
        result = queue.filter(item => item.farm_id === farmId).length;
      }).catch(err => {
        console.error('Failed to serialize web sync queue getPendingCount:', err);
      }));
      return result;
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
      if (!ALLOWED_TABLES.has(mutation.table_name)) {
        console.warn(`Discarding sync mutation: invalid table name ${mutation.table_name}`);
        await syncQueue.dequeueMutation(mutation.id);
        continue;
      }
      
      let error = null;

      try {
        if (mutation.operation === 'insert') {
          const conflictColumns = mutation.table_name === 'fsa_tract_imports'
            ? 'farm_id,tract_key'
            : mutation.table_name === 'field_clu_assignments'
              ? 'farm_id,tract_key,clu_number'
              : null;
          const query = supabase.from(mutation.table_name);
          const { error: err } = conflictColumns
            ? await query.upsert(
              [{ ...mutation.payload, farm_id: farmId }],
              { onConflict: conflictColumns },
            )
            : await query.insert([{ ...mutation.payload, farm_id: farmId }]);
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
              toast.error(`Offline ${mutation.operation} to ${mutation.table_name} failed after 3 tries and was discarded.`);
              await syncQueue.dequeueMutation(mutation.id);
            } else {
              await syncQueue.incrementRetry(mutation.id, mutation.retry_count);
              // Intentional choice to continue processing so a poisoned or invalid mutation
              // (e.g., RLS or schema constraint violation) does not block unrelated queue items indefinitely.
              // Note: Dependent mutations in a chain (like insert -> update on the same row) will also
              // fail and increment retry counts until discarded, but unrelated rows will sync successfully.
              continue;
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
