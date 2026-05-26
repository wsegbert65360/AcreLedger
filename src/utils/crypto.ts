import { Preferences } from '@capacitor/preferences';

const PERSISTENT_KEY_STORAGE = 'al_local_encryption_key';

/**
 * Retrieves or generates a persistent local encryption key.
 * This ensures data remains readable even if the user is offline or the session expires.
 */
export async function getLocalEncryptionKey(): Promise<string> {
  // Try Preferences (Keychain on iOS/Android, localStorage on Web)
  let { value: key } = await Preferences.get({ key: PERSISTENT_KEY_STORAGE });
  
  if (!key) {
    key = crypto.randomUUID();
    await Preferences.set({ key: PERSISTENT_KEY_STORAGE, value: key });
  }
  
  return key;
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
    const ivB64 = btoa(String.fromCharCode(...iv));
    const encB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    return `enc:${ivB64}:${encB64}`;
  } catch (err) {
    console.error('Encryption failed', err);
    return data;
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
    console.error('Decryption failed', err);
    return '';
  }
}