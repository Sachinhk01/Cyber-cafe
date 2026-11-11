import { Router } from 'express';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { PrintJob, Document, getSettings } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';
import { upload, removeFile } from '../lib/upload.js';

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

// FR-19: upload a file for printing
r.post(
  '/',
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to print.');
    try {
      const pages = await countPages(req.file);
      const opts = parseOptions(req.body);
      const { printRates } = await getSettings();
      const job = await PrintJob.create({
        user: req.user.id,
        fileName: req.file.originalname,
        pages,
        ...opts,
        price: printPrice(printRates, { pages, ...opts }),
      });
      await Document.create({
        user: req.user.id,
        printJob: job._id,
        label: 'Print file',
        fileUrl: req.file.path,
        originalName: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
      });
      res.status(201).json(job);
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

r.get(
  '/',
  ah(async (req, res) => {
    res.json(await PrintJob.find({ user: req.user.id }).sort({ createdAt: -1 }));
  })
);

export default r;
