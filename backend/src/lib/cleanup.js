import { Document } from '../models.js';
import { removeFile } from './upload.js';

// Privacy rule: delete documents after the retention period once an order is finished.
export async function runCleanup() {
  const expired = await Document.find({ expiresAt: { $lte: new Date() } });
  for (const doc of expired) {
    removeFile(doc.fileUrl);
    await doc.deleteOne();
  }
  if (expired.length) console.log(`Cleanup: deleted ${expired.length} expired document(s).`);
}

export function startCleanupJob() {
  runCleanup().catch((e) => console.error('Cleanup failed:', e.message));
  setInterval(() => runCleanup().catch((e) => console.error('Cleanup failed:', e.message)), 6 * 60 * 60 * 1000);
}
