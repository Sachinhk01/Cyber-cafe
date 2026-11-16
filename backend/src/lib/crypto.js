// C3: customer documents (Aadhaar, PAN ...) are encrypted on disk with AES-256-GCM.
// The key comes from FILE_ENCRYPTION_KEY (64 hex characters). In development a key is
// created once in backend/.file-key so you can start without setting anything.
// Keep the key safe and backed up: without it, stored documents cannot be opened.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAGIC = Buffer.from('CCE1'); // marks an encrypted file
const DEV_KEY_FILE = path.resolve('.file-key');

function loadKey() {
  const raw = (process.env.FILE_ENCRYPTION_KEY || '').trim();
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('FILE_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FILE_ENCRYPTION_KEY is missing. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  if (fs.existsSync(DEV_KEY_FILE)) return Buffer.from(fs.readFileSync(DEV_KEY_FILE, 'utf8').trim(), 'hex');
  const key = crypto.randomBytes(32);
  fs.writeFileSync(DEV_KEY_FILE, key.toString('hex'), { mode: 0o600 });
  console.log('Created a development file-encryption key in backend/.file-key (set FILE_ENCRYPTION_KEY in production).');
  return key;
}

let KEY = null;
const key = () => (KEY ||= loadKey());
export const checkEncryptionKey = () => key();

export function encryptBuffer(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function decryptBuffer(data) {
  if (!data.subarray(0, 4).equals(MAGIC)) throw new Error('Not an encrypted file');
  const iv = data.subarray(4, 16);
  const tag = data.subarray(16, 32);
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data.subarray(32)), d.final()]);
}

export async function encryptFileInPlace(filePath) {
  const plain = await fs.promises.readFile(filePath);
  const tmp = filePath + '.enc';
  await fs.promises.writeFile(tmp, encryptBuffer(plain), { mode: 0o600 });
  await fs.promises.rename(tmp, filePath);
}

// Reads a stored document; older files saved before encryption are returned as they are.
export async function readStoredFile(doc) {
  const data = await fs.promises.readFile(doc.fileUrl);
  return doc.encrypted ? decryptBuffer(data) : data;
}

// Backups use the same key
export const encryptBackup = encryptBuffer;
export const decryptBackup = decryptBuffer;
export const isEncrypted = (buf) => buf.subarray(0, 4).equals(MAGIC);
