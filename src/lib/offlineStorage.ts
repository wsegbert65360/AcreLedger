import { Capacitor } from '@capacitor/core';
import {
  SQLiteConnection,
  CapacitorSQLite,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Preferences } from '@capacitor/preferences';
import { toast } from 'sonner';
import { SYNC_QUEUE_KEYS } from '@/lib/syncQueueKeys';
import { encryptData, decryptData, getLocalEncryptionKey } from '@/utils/crypto';

let cacheWriteWarned = false;
/**
 * A failed cache write (storage full) means a reload while offline would show
 * an older copy and the farmer might re-enter records. Say so once per session.
 * The sync queue itself is separate and unaffected.
 */
function warnCacheWriteFailed(): void {
  if (cacheWriteWarned) return;
  cacheWriteWarned = true;
  toast.warning('This device could not save its offline copy of your records.', {
    description: 'Your changes are still queued to sync. Stay online until they finish, and free up storage on this device.',
  });
}

const isNative = Capacitor.isNativePlatform();

export const OFFLINE_DATABASE_UNAVAILABLE = 'Offline database unavailable.';
export const OFFLINE_STORE_UNAVAILABLE_MESSAGE =
  'This phone cannot open its offline records. Stay signed in so unsynced work is not lost.';

export function isOfflineDatabaseUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message === OFFLINE_DATABASE_UNAVAILABLE;
}

let dbConnection: SQLiteDBConnection | null = null;
let sqliteConnection: SQLiteConnection | null = null;
let initPromise: Promise<SQLiteDBConnection | null> | null = null;
let nativeStoreFailed = false;
let unavailableToastShown = false;
let deviceKeyUnreadLogged = false;
const unreadableWebCacheLogged = new Set<string>();

function logDeviceKeyUnread(): void {
  if (deviceKeyUnreadLogged) return;
  deviceKeyUnreadLogged = true;
  console.debug('[OfflineStorage] Could not read the device key; left cached rows in place');
}

function dropUnreadableWebCache(key: string, table: string, reason: 'decrypt' | 'parse'): void {
  // The sync queue uses different localStorage keys. A cache miss must not clear it.
  if (SYNC_QUEUE_KEYS.some(queueKey => key === queueKey)) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage rejected the delete. The next load still returns a miss.
  }
  if (unreadableWebCacheLogged.has(table)) return;
  unreadableWebCacheLogged.add(table);
  console.debug(`[OfflineStorage] Dropped unreadable local cache for ${table} (${reason})`);
}

async function getEncryptionSecret(): Promise<string> {
  return getLocalEncryptionKey();
}

/** True when this native device tried to open the encrypted store and failed. */
export function isNativeOfflineStoreUnavailable(): boolean {
  return isNative && nativeStoreFailed && !dbConnection;
}

/**
 * Retrieves or initializes the SQLite database connection on native platforms.
 * Safe no-op on Web.
 */
export async function getDatabase() {
  if (!isNative) return null;
  if (dbConnection) return dbConnection;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!sqliteConnection) {
        sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      }

      try {
        await sqliteConnection.checkConnectionsConsistency();
      } catch (err) {
        console.warn('[OfflineStorage] Connection consistency check failed:', err);
      }

      const isConn = (await sqliteConnection.isConnection('acreledger_db', false)).result;
      if (isConn) {
        dbConnection = await sqliteConnection.retrieveConnection('acreledger_db', false);
        const isOpened = (await dbConnection.isDBOpen()).result;
        if (!isOpened) {
          await dbConnection.open();
        }
      } else {
        const encKey = await getEncryptionSecret();

        const isSecretStored = (await sqliteConnection.isSecretStored()).result;
        if (!isSecretStored) {
          await sqliteConnection.setEncryptionSecret(encKey);
        }

        // Builds before native encryption was enabled created a plaintext
        // SQLite file. Opening that existing file directly in `secret` mode
        // fails closed and leaves sign-out/offline sync permanently blocked.
        // Convert it once with the plugin's supported encryption mode, then
        // reopen it normally with the Keychain-backed secret.
        const databaseExists = (await sqliteConnection.isDatabase('acreledger_db')).result;
        if (databaseExists) {
          const isEncrypted = (await sqliteConnection.isDatabaseEncrypted('acreledger_db')).result;
          if (!isEncrypted) {
            const migrationConnection = await sqliteConnection.createConnection(
              'acreledger_db',
              true,
              'encryption',
              1,
              false
            );
            await migrationConnection.open();
            await sqliteConnection.closeConnection('acreledger_db', false);
          }
        }

        try {
          dbConnection = await sqliteConnection.createConnection(
            'acreledger_db',
            true, // encrypted
            'secret', // mode
            1, // version
            false // readonly
          );
        } catch (createErr) {
          // A JS reload can drop the wrapper while the native connection remains.
          const leftover = (await sqliteConnection.isConnection('acreledger_db', false)).result;
          if (!leftover) throw createErr;
          dbConnection = await sqliteConnection.retrieveConnection('acreledger_db', false);
        }
        const isOpened = (await dbConnection.isDBOpen()).result;
        if (!isOpened) {
          await dbConnection.open();
        }
      }

      // Older builds duplicated the database passphrase in plaintext
      // Preferences. SQLCipher already retains its configured secret in the
      // native secure store, so remove the obsolete copy after a safe open.
      await Preferences.remove({ key: 'db_enc_key' }).catch(error => {
        console.warn('[OfflineStorage] Could not remove legacy database key copy:', error);
      });

      // Create the offline cache table
      await dbConnection.execute(`
        CREATE TABLE IF NOT EXISTS offline_cache (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT
        );
      `);

      // Create the sync queue table
      await dbConnection.execute(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY,
          table_name TEXT,
          operation TEXT,
          payload TEXT,
          farm_id TEXT,
          created_at TEXT,
          retry_count INTEGER DEFAULT 0
        );
      `);

      nativeStoreFailed = false;
      unavailableToastShown = false;
      return dbConnection;
    } catch (err) {
      console.error('Failed to initialize SQLite database:', err);
      nativeStoreFailed = true;
      dbConnection = null;
      initPromise = null; // Reset so that we can retry if needed
      if (!unavailableToastShown) {
        unavailableToastShown = true;
        toast.error(OFFLINE_STORE_UNAVAILABLE_MESSAGE);
      }
      return null;
    }
  })();

  return initPromise;
}

/** Cache entry that records which farm the user's cached rows belong to. */
const CACHE_FARM_MARKER = '__cache_farm';

export const offlineStorage = {
  /**
   * Saves a table's data array to local cache.
   */
  saveCache: async (table: string, userId: string | null, data: any[]): Promise<void> => {
    const key = userId ? `${userId}_al_${table}` : `al_${table}`;
    
    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          const valueStr = JSON.stringify(data);
          const now = new Date().toISOString();
          await db.run(
            'INSERT OR REPLACE INTO offline_cache (key, value, updated_at) VALUES (?, ?, ?);',
            [key, valueStr, now]
          );
        }
      } catch (err) {
        console.error(`Failed to save offline cache for ${table}:`, err);
        warnCacheWriteFailed();
      }
    } else {
      try {
        const secret = await getEncryptionSecret();
        const encrypted = await encryptData(JSON.stringify(data), secret);
        localStorage.setItem(key, encrypted);
      } catch (err) {
        console.error(`Failed to save localStorage cache for ${table}:`, err);
        warnCacheWriteFailed();
      }
    }
  },

  /**
   * Loads a table's data array from local cache. Returns null if no cache is found.
   */
  loadCache: async (table: string, userId: string | null): Promise<any[] | null> => {
    const key = userId ? `${userId}_al_${table}` : `al_${table}`;

    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          const res = await db.query('SELECT value FROM offline_cache WHERE key = ?;', [key]);
          if (res.values && res.values.length > 0) {
            return JSON.parse(res.values[0].value);
          }
        }
      } catch (err) {
        console.error(`Failed to load offline cache for ${table}:`, err);
      }
      return null;
    } else {
      let val: string | null;
      try {
        val = localStorage.getItem(key);
      } catch (err) {
        console.error(`Failed to load localStorage cache for ${table}:`, err);
        return null;
      }
      if (!val) return null;

      // A missing device key can be temporary (storage unavailable). Leave the
      // ciphertext in place so a later read can still decrypt it.
      let secret: string;
      try {
        secret = await getEncryptionSecret();
      } catch {
        logDeviceKeyUnread();
        return null;
      }

      // The key was read. Ciphertext this key cannot open, or a value that
      // decrypts but is not JSON, is a cache miss. Drop only this table's key
      // so the next fetch can rewrite it. Do not log an error on every startup.
      let decrypted: string;
      try {
        decrypted = await decryptData(val, secret);
      } catch {
        dropUnreadableWebCache(key, table, 'decrypt');
        return null;
      }
      try {
        return JSON.parse(decrypted);
      } catch {
        dropUnreadableWebCache(key, table, 'parse');
        return null;
      }
    }
  },

  /**
   * The cache is keyed by user. When the server says this user now belongs to
   * a different farm, drop the old farm's cached rows so they are never shown
   * as this farm's. The sync queue is keyed by farm and is left alone.
   * Returns true when the cache was cleared.
   */
  bindCacheToFarm: async (userId: string, farmId: string): Promise<boolean> => {
    const cached = await offlineStorage.loadCache(CACHE_FARM_MARKER, userId);
    const previous = Array.isArray(cached) && typeof cached[0] === 'string' ? cached[0] : null;
    const changed = previous !== null && previous !== farmId;
    if (changed) await offlineStorage.clearCache(userId);
    if (changed || previous === null) await offlineStorage.saveCache(CACHE_FARM_MARKER, userId, [farmId]);
    return changed;
  },

  /**
   * Clears all cache data associated with a specific user ID.
   */
  clearCache: async (userId: string | null): Promise<void> => {
    if (!userId) throw new Error('A user ID is required to clear offline cache.');
    const prefix = `${userId}_al_`;
    
    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          await db.run('DELETE FROM offline_cache WHERE key LIKE ?;', [`${prefix}%`]);
        }
      } catch (err) {
        console.error('Failed to clear SQLite cache:', err);
      }
    } else {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix) && !SYNC_QUEUE_KEYS.some(queueKey => key === queueKey)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (err) {
        console.error('Failed to clear localStorage cache:', err);
      }
    }
  }
};
