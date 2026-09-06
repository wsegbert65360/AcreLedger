import { Preferences } from '@capacitor/preferences';

const PERSISTENT_KEY_STORAGE = 'al_local_encryption_key';
const ENCRYPTION_KEY_LOCK = 'acreledger-local-encryption-key';
const BASE64_CHUNK_SIZE = 0x8000;
let localEncryptionKeyPromise: Promise<string> | null = null;

/**
 * Converts arbitrary binary data without spreading the entire payload into a
 * single function call. Large offline caches and encoded attachments can be
 * several hundred kilobytes, beyond JavaScript engines' argument limits.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(''));
}

/**
 * Retrieves or generates a persistent local encryption key.
 * This ensures data remains readable even if the user is offline or the session expires.
 */
async function readOrCreateLocalEncryptionKey(): Promise<string> {
  let { value: key } = await Preferences.get({ key: PERSISTENT_KEY_STORAGE });

  if (!key) {
    key = crypto.randomUUID();
    await Preferences.set({ key: PERSISTENT_KEY_STORAGE, value: key });
  }

  return key;
}

async function initializeLocalEncryptionKey(): Promise<string> {
  // Web Locks coordinate first use across browser tabs and workers. Native
  // runtimes have one active JS context, where the shared promise below is the
  // serialization boundary.
  const lockManager = globalThis.navigator?.locks;
  if (lockManager) {
    return lockManager.request(ENCRYPTION_KEY_LOCK, readOrCreateLocalEncryptionKey);
  }
  return readOrCreateLocalEncryptionKey();
}

export function getLocalEncryptionKey(): Promise<string> {
  // Cache the promise, not only its result, so simultaneous callers all await
  // the same read/generate/write transaction. Clear a rejected initialization
  // so a transient storage failure can be retried.
  if (!localEncryptionKeyPromise) {
    localEncryptionKeyPromise = initializeLocalEncryptionKey().catch(error => {
      localEncryptionKeyPromise = null;
      throw error;
    });
  }
  return localEncryptionKeyPromise;
}

export async function generateKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('al-offline-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: string, secret: string): Promise<string> {
  if (!secret) return data;
  try {
    const key = await generateKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(data)
    );
    const ivB64 = bytesToBase64(iv);
    const encB64 = bytesToBase64(new Uint8Array(encrypted));
    return `enc:${ivB64}:${encB64}`;
  } catch (err) {
    throw new Error(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function decryptData(encryptedStr: string, secret: string): Promise<string> {
  if (!secret || !encryptedStr.startsWith('enc:')) return encryptedStr;
  try {
    const parts = encryptedStr.split(':');
    const ivB64 = parts[1];
    const encB64 = parts[2];
    const iv = new Uint8Array(atob(ivB64).split('').map(c => c.charCodeAt(0)));
    const encData = new Uint8Array(atob(encB64).split('').map(c => c.charCodeAt(0)));
    const key = await generateKey(secret);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encData
    );
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    throw new Error(`Decryption failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
