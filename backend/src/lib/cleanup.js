import { Document, Order, PrintJob } from '../models.js';
import { removeFile } from './upload.js';
import { DAY_MS } from './time.js';

// Unpaid drafts (customer uploaded documents but never paid) are cleared after this many days.
const DRAFT_DAYS = Number(process.env.DRAFT_DAYS || 3);

// Privacy rule (SRS 5): delete documents after the retention period once an order is finished,
// and never keep documents of abandoned, unpaid orders.
export async function runCleanup() {
  // 1. Finished orders / collected prints whose retention period is over
  const expired = await Document.find({ expiresAt: { $lte: new Date() } });
  for (const doc of expired) {
    removeFile(doc.fileUrl);
    await doc.deleteOne();
  }

  // 2. Abandoned drafts: never paid, older than DRAFT_DAYS
  const cutoff = new Date(Date.now() - DRAFT_DAYS * DAY_MS);
  const [orders, jobs] = await Promise.all([
    Order.find({ status: 'PendingPayment', paymentStatus: { $ne: 'Paid' }, createdAt: { $lt: cutoff } }).select('_id').lean(),
    PrintJob.find({ status: 'PendingPayment', paymentStatus: { $ne: 'Paid' }, createdAt: { $lt: cutoff } }).select('_id').lean(),
  ]);
  const drafts = await Document.find({
    $or: [{ order: { $in: orders.map((o) => o._id) } }, { printJob: { $in: jobs.map((j) => j._id) } }],
  });
  for (const doc of drafts) {
    removeFile(doc.fileUrl);
    await doc.deleteOne();
  }

  const total = expired.length + drafts.length;
  if (total) console.log(`Cleanup: deleted ${expired.length} expired and ${drafts.length} unpaid-draft document(s).`);
  return { expired: expired.length, drafts: drafts.length };
}

export function startCleanupJob() {
  runCleanup().catch((e) => console.error('Cleanup failed:', e.message));
  setInterval(() => runCleanup().catch((e) => console.error('Cleanup failed:', e.message)), 6 * 60 * 60 * 1000);
}
