import { Capacitor } from '@capacitor/core';
import { SQLiteConnection, CapacitorSQLite } from '@capacitor-community/sqlite';

const isNative = Capacitor.isNativePlatform();

let dbConnection: any = null;
let sqliteConnection: any = null;
let initPromise: Promise<any> | null = null;

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

      const isConn = (await sqliteConnection.isConnection('acreledger_db')).result;
      if (isConn) {
        dbConnection = await sqliteConnection.retrieveConnection('acreledger_db');
      } else {
        dbConnection = await sqliteConnection.createConnection(
          'acreledger_db',
          false, // encrypted
          'no-encryption', // mode
          1, // version
          false // readonly
        );
      }

      await dbConnection.open();

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

      return dbConnection;
    } catch (err) {
      console.error('Failed to initialize SQLite database:', err);
      initPromise = null; // Reset so that we can retry if needed
      return null;
    }
  })();

  return initPromise;
}

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
      }
    } else {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (err) {
        console.error(`Failed to save localStorage cache for ${table}:`, err);
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
      try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : null;
      } catch (err) {
        console.error(`Failed to load localStorage cache for ${table}:`, err);
        return null;
      }
    }
  },

  /**
   * Clears all cache data associated with a specific user ID.
   */
  clearCache: async (userId: string | null): Promise<void> => {
    const prefix = userId ? `${userId}_al_` : 'al_';
    
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
          if (key && key.startsWith(prefix)) {
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
