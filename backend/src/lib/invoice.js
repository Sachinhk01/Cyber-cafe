// FR-18: PDF receipt / invoice generated on the server with pdf-lib.
// Business details come from .env (CAFE_NAME, CAFE_ADDRESS, CAFE_PHONE, CAFE_EMAIL, CAFE_GSTIN).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// The built-in PDF fonts can't draw "₹" or Indian scripts, so keep text to plain Latin.
const clean = (v) =>
  String(v ?? '')
    .replace(/₹/g, 'Rs ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .trim();

const money = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// payment must have user, order, printJob populated
export async function buildInvoicePdf(payment) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.13, 0.17);
  const muted = rgb(0.36, 0.42, 0.47);
  const accent = rgb(0.04, 0.43, 0.39);
  const W = 595.28;
  const L = 50;
  const R = W - 50;
  let y = 790;

  const text = (s, x, yy, { size = 10, f = font, color = ink, right = false } = {}) => {
    const t = clean(s);
    const w = f.widthOfTextAtSize(t, size);
    page.drawText(t, { x: right ? x - w : x, y: yy, size, font: f, color });
  };
  const line = (yy, color = rgb(0.86, 0.89, 0.91)) => page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 1, color });

  const cafe = clean(process.env.CAFE_NAME || 'Cyber Cafe');
  const target = payment.order || payment.printJob || {};
  const isOrder = payment.kind === 'order';

  // Header
  text(cafe, L, y, { size: 20, f: bold, color: accent });
  text(payment.refund?.status === 'Processed' ? 'RECEIPT (REFUNDED)' : 'RECEIPT', R, y + 2, { size: 12, f: bold, right: true });
  y -= 18;
  for (const s of [process.env.CAFE_ADDRESS, process.env.CAFE_PHONE && `Phone: ${process.env.CAFE_PHONE}`, process.env.CAFE_EMAIL, process.env.CAFE_GSTIN && `GSTIN: ${process.env.CAFE_GSTIN}`]) {
    if (s) {
      text(s, L, y, { size: 9, color: muted });
      y -= 12;
    }
  }
  y -= 10;
  line(y);
  y -= 26;

  // Meta
  const meta = [
    ['Receipt no.', target.receiptNo || '-'],
    [isOrder ? 'Order no.' : 'Print job', target.orderNo || target.jobNo || '-'],
    ['Date', fmt(target.paidAt || payment.paidAt || payment.updatedAt)],
    ['Payment ID', payment.razorpayPaymentId || '-'],
    ['Payment status', payment.status],
  ];
  const billTo = [payment.user?.name, payment.user?.mobile && `Mobile: ${payment.user.mobile}`, payment.user?.email].filter(Boolean);
  text('BILLED TO', L, y, { size: 8, f: bold, color: muted });
  text('DETAILS', 330, y, { size: 8, f: bold, color: muted });
  y -= 15;
  const top = y;
  billTo.forEach((s, i) => text(s, L, top - i * 14, { size: 10, f: i === 0 ? bold : font }));
  meta.forEach(([k, v], i) => {
    text(k, 330, top - i * 14, { size: 9, color: muted });
    text(v, R, top - i * 14, { size: 9, right: true });
  });
  y = top - Math.max(billTo.length, meta.length) * 14 - 20;

  // Item table
  page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 22, color: rgb(0.95, 0.97, 0.97) });
  text('Item', L + 8, y, { size: 9, f: bold });
  text('Amount', R - 8, y, { size: 9, f: bold, right: true });
  y -= 28;

  const lines = [];
  if (isOrder) {
    lines.push([target.serviceName || 'Service', payment.amount]);
    const details = target.details instanceof Map ? Object.fromEntries(target.details) : target.details || {};
    Object.entries(details).forEach(([k, v]) => lines.push([`   ${k}: ${v}`, null]));
  } else {
    const j = target;
    lines.push([`Printing: ${j.fileName || 'file'}`, payment.amount]);
    lines.push([`   ${j.pages} page(s) x ${j.copies} copies, ${j.colorMode === 'color' ? 'colour' : 'black & white'}, ${j.paperSize}`, null]);
    if (j.pickupCode) lines.push([`   Pickup code: ${j.pickupCode}`, null]);
  }
  for (const [label, amt] of lines) {
    // wrap long labels
    let rest = clean(label);
    const max = 380;
    let first = true;
    while (rest) {
      let cut = rest.length;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), 10) > max) {
        const space = rest.lastIndexOf(' ', cut - 1);
        cut = space > 0 ? space : cut - 1;
      }
      text(rest.slice(0, cut), L + 8, y, { size: amt === null ? 9 : 10, color: amt === null ? muted : ink });
      if (amt !== null && first) text(money(amt), R - 8, y, { size: 10, right: true });
      first = false;
      rest = rest.slice(cut).trim();
      y -= 15;
    }
  }
  y -= 4;
  line(y);
  y -= 20;
  text('Total paid', 330, y, { size: 11, f: bold });
  text(money(payment.amount), R - 8, y, { size: 11, f: bold, right: true });
  if (payment.refund?.status === 'Processed') {
    y -= 16;
    text('Refunded', 330, y, { size: 10, color: muted });
    text('- ' + money(payment.refund.amount), R - 8, y, { size: 10, right: true, color: muted });
    y -= 16;
    text('Net', 330, y, { size: 11, f: bold });
    text(money(payment.amount - payment.refund.amount), R - 8, y, { size: 11, f: bold, right: true });
  }

  // Footer
  const notes = [
    isOrder ? 'We will update you by SMS/email as your order progresses.' : 'Show the pickup code at the counter to collect your printout.',
    'Uploaded documents are deleted automatically after the order is finished.',
    'This is a computer-generated receipt and does not need a signature.',
  ];
  notes.forEach((s, i) => text(s, L, 70 - i * 12, { size: 8, color: muted }));

  pdf.setTitle(`Receipt ${target.receiptNo || ''}`);
  pdf.setAuthor(cafe);
  return Buffer.from(await pdf.save());
}

export const invoiceFileName = (payment) => `receipt-${(payment.order || payment.printJob)?.receiptNo || payment._id}.pdf`;
