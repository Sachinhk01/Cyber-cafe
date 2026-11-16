import { Router } from 'express';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { PrintJob, Document, Payment, getSettings, nextNumber } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';
import { upload, removeFile, assertRealFiles, encryptUploads, docFields } from '../lib/upload.js';

const r = Router();

export function printPrice(rates, { pages, copies, colorMode, paperSize }) {
  return rates[colorMode][paperSize] * pages * copies;
}

function parseOptions(body) {
  const copies = Math.max(1, Math.min(100, parseInt(body.copies, 10) || 1));
  const colorMode = body.colorMode === 'color' ? 'color' : 'bw';
  const paperSize = body.paperSize === 'A3' ? 'A3' : 'A4';
  return { copies, colorMode, paperSize };
}

async function countPages(file) {
  if (file.mimetype !== 'application/pdf') return 1;
  try {
    const pdf = await PDFDocument.load(await fs.promises.readFile(file.path), { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    throw new HttpError(400, 'This PDF could not be read. Try saving it again or upload an image.');
  }
}

// Public rates so the price can update live in the browser (FR-20)
r.get(
  '/rates',
  ah(async (req, res) => {
    const s = await getSettings();
    res.json(s.printRates);
  })
);

r.use(auth(['customer']));

const MAX_UNPAID_PRINTS = Number(process.env.MAX_UNPAID_PRINTS || 5);

// FR-19: upload a file for printing
r.post(
  '/',
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to print.');
    try {
      // D2: limit unpaid jobs per customer
      const unpaid = await PrintJob.countDocuments({ user: req.user.id, status: 'PendingPayment' });
      if (unpaid >= MAX_UNPAID_PRINTS) throw new HttpError(429, `You have ${unpaid} unpaid print jobs. Pay for or remove one first.`);
      await assertRealFiles([req.file]);
      const pages = await countPages(req.file); // F2: page count before paying
      const opts = parseOptions(req.body);
      const { printRates } = await getSettings();
      await encryptUploads([req.file]); // C3
      const job = await PrintJob.create({
        jobNo: await nextNumber('print', 'PR'),
        user: req.user.id,
        fileName: req.file.originalname,
        pages,
        ...opts,
        price: printPrice(printRates, { pages, ...opts }),
      });
      const doc = await Document.create({
        user: req.user.id,
        printJob: job._id,
        kind: 'print',
        label: 'Print file',
        uploadedBy: 'Customer',
        ...docFields(req.file),
      });
      res.status(201).json({ ...job.toObject(), documentId: doc._id });
    } catch (e) {
      removeFile(req.file.path);
      throw e;
    }
  })
);

// Change options before paying
r.patch(
  '/:id',
  ah(async (req, res) => {
    const job = await PrintJob.findOne({ _id: req.params.id, user: req.user.id }).catch(() => null);
    if (!job) throw new HttpError(404, 'Print job not found.');
    if (job.paymentStatus === 'Paid') throw new HttpError(400, 'This job is already paid.');
    const opts = parseOptions(req.body);
    const { printRates } = await getSettings();
    Object.assign(job, opts, { price: printPrice(printRates, { pages: job.pages, ...opts }) });
    await job.save();
    res.json(job);
  })
);

// My print jobs, each with the id of its file so the customer can open or save it again
r.get(
  '/',
  ah(async (req, res) => {
    const jobs = await PrintJob.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
    const docs = await Document.find({ printJob: { $in: jobs.map((j) => j._id) } }).select('_id printJob').lean();
    const docByJob = Object.fromEntries(docs.map((d) => [String(d.printJob), d._id]));
    res.json(jobs.map((j) => ({ ...j, documentId: docByJob[String(j._id)] || null })));
  })
);

// Remove an unpaid print job and its file
r.delete(
  '/:id',
  ah(async (req, res) => {
    const job = await PrintJob.findOne({ _id: req.params.id, user: req.user.id }).catch(() => null);
    if (!job) throw new HttpError(404, 'Print job not found.');
    if (['Paid', 'Refunded'].includes(job.paymentStatus)) throw new HttpError(400, 'This print job is already paid.');
    if (await Payment.exists({ printJob: job._id, status: 'Pending', createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) } })) {
      throw new HttpError(400, 'A payment for this job may still be in progress. Try again in 15 minutes.');
    }
    const docs = await Document.find({ printJob: job._id });
    docs.forEach((d) => removeFile(d.fileUrl));
    await Document.deleteMany({ printJob: job._id });
    await Payment.deleteMany({ printJob: job._id, status: { $ne: 'Success' } });
    await job.deleteOne();
    res.json({ ok: true });
  })
);

export default r;
