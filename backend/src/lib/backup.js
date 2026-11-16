// SRS 5 Reliability: daily database backup.
// C2: backups are encrypted with the same key as documents (FILE_ENCRYPTION_KEY), and the owner
// can download a copy from Admin > Settings to keep it off the server.
// Files: BACKUP_DIR/cyber-cafe-YYYY-MM-DD.json.gz.enc, the last BACKUP_KEEP days are kept.
// Restore with: npm run restore -- backups/cyber-cafe-2026-11-11.json.gz.enc --yes
// (If you use MongoDB Atlas, also turn on its own backups. Uploaded files are not inside
//  this backup: back up the UPLOAD_DIR folder / disk too.)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import mongoose from 'mongoose';
import { encryptBackup, decryptBackup, isEncrypted } from './crypto.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const EJSON = () => mongoose.mongo.BSON.EJSON;

const enabled = () => (process.env.BACKUP_DIR || 'backups') !== 'off';
const dir = () => path.resolve(process.env.BACKUP_DIR || 'backups');
const keep = () => Math.max(1, Number(process.env.BACKUP_KEEP || 14));
const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const FILE_RE = /^cyber-cafe-\d{4}-\d{2}-\d{2}\.json\.gz(\.enc)?$/;
const fileFor = (day) => path.join(dir(), `cyber-cafe-${day}.json.gz.enc`);
export const backupFileName = () => `cyber-cafe-${todayIst()}.json.gz.enc`;

export async function createBackupBuffer() {
  const db = mongoose.connection.db;
  const out = { createdAt: new Date().toISOString(), collections: {} };
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.') || name === 'otps') continue; // OTPs are temporary
    out.collections[name] = await db.collection(name).find({}).toArray();
  }
  return encryptBackup(await gzip(EJSON().stringify(out, { relaxed: false })));
}

export async function runBackup() {
  const data = await createBackupBuffer();
  fs.mkdirSync(dir(), { recursive: true });
  const target = fileFor(todayIst());
  const tmp = target + '.tmp';
  await fs.promises.writeFile(tmp, data, { mode: 0o600 });
  await fs.promises.rename(tmp, target);

  // keep only the newest N backups
  const files = (await fs.promises.readdir(dir())).filter((f) => FILE_RE.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep()))) await fs.promises.unlink(path.join(dir(), old)).catch(() => {});
  console.log(`Backup saved: ${target} (${Math.round(data.length / 1024)} KB, encrypted)`);
  return target;
}

export async function restoreBackup(file, { dropFirst = true } = {}) {
  let raw = await fs.promises.readFile(file);
  if (isEncrypted(raw)) raw = decryptBackup(raw); // older backups were not encrypted
  const data = EJSON().parse((await gunzip(raw)).toString(), { relaxed: false });
  const db = mongoose.connection.db;
  for (const [name, docs] of Object.entries(data.collections)) {
    if (dropFirst) await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs);
    console.log(`Restored ${name}: ${docs.length}`);
  }
}

// Checks every hour and makes one backup per day (India date), starting a minute after the server boots.
// A host that sleeps (free plans) can skip days: run `npm run backup` from an external scheduler too.
export function startBackupJob() {
  if (!enabled()) return console.log('Backups are off (BACKUP_DIR=off).');
  const tick = async () => {
    try {
      if (!fs.existsSync(fileFor(todayIst()))) await runBackup();
    } catch (e) {
      console.error('Backup failed:', e.message);
    }
  };
  setTimeout(tick, 60 * 1000); // shortly after start
  setInterval(tick, 60 * 60 * 1000);
}
