import { Router } from 'express';
import { Order, Service, Document, Payment, nextNumber } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';
import { upload, removeFile, assertRealFiles, encryptUploads, docFields } from '../lib/upload.js';
import { reconcilePending } from '../lib/payments.js';

const r = Router();
r.use(auth(['customer']));

// D2 / B4: one customer can't fill the disk or flood the counter
const MAX_UNPAID = Number(process.env.MAX_UNPAID_ORDERS || 5);
const MAX_OPEN_FREE = Number(process.env.MAX_OPEN_FREE_ORDERS || 2);

// FR-10..13: create order with uploaded documents. Files come as doc_0, doc_1 ... matching service.requiredDocs.
r.post(
  '/',
  upload.any(),
  ah(async (req, res) => {
    const files = req.files || [];
    const cleanup = () => files.forEach((f) => removeFile(f.path));
    try {
      const service = await Service.findById(req.body.serviceId).catch(() => null);
      if (!service || !service.isActive) throw new HttpError(404, 'Service not found.');

      // A2: the customer must accept the procedure and terms before paying
      if (String(req.body.agreeTerms) !== 'true') throw new HttpError(400, 'Please read the steps and tick "I agree to the terms" to continue.');

      const unpaid = await Order.countDocuments({ user: req.user.id, status: 'PendingPayment' });
      if (unpaid >= MAX_UNPAID) {
        throw new HttpError(429, `You have ${unpaid} unpaid orders. Pay for or cancel one of them before starting a new order.`);
      }
      if (service.price <= 0) {
        const openFree = await Order.countDocuments({
          user: req.user.id,
          totalAmount: 0,
          status: { $in: ['PendingPayment', 'Submitted', 'In Progress'] },
        });
        if (openFree >= MAX_OPEN_FREE) throw new HttpError(429, 'You already have free requests open. Please wait until they are finished.');
      }

      const byField = Object.fromEntries(files.map((f) => [f.fieldname, f]));
      const missing = service.requiredDocs.filter((_, i) => !byField[`doc_${i}`]);
      if (missing.length) throw new HttpError(400, `Upload these documents: ${missing.join(', ')}.`);
      await assertRealFiles(files);

      // Files that don't match a required document are not kept
      const wanted = new Set(service.requiredDocs.map((_, i) => `doc_${i}`));
      files.filter((f) => !wanted.has(f.fieldname)).forEach((f) => removeFile(f.path));
      const kept = files.filter((f) => wanted.has(f.fieldname));

      let details = {};
      try {
        details = JSON.parse(req.body.details || '{}');
      } catch {
        throw new HttpError(400, 'Details are not in the right format.');
      }
      const emptyField = service.detailFields.find((f) => !String(details[f] || '').trim());
      if (emptyField) throw new HttpError(400, `Fill in "${emptyField}".`);
      // Older services may have "." in a field name, which MongoDB rejects as a key
      const safeKey = (k) => k.replace(/\./g, '·').replace(/^\$/, '');
      const cleanDetails = Object.fromEntries(service.detailFields.map((f) => [safeKey(f), String(details[f]).trim().slice(0, 500)]));

      await encryptUploads(kept); // C3

      const order = await Order.create({
        orderNo: await nextNumber('order', 'CC'),
        user: req.user.id,
        service: service._id,
        serviceName: service.name,
        details: cleanDetails,
        totalAmount: service.price,
        docsUploaded: service.requiredDocs.length,
        agreedToTermsAt: new Date(),
        history: [{ status: 'PendingPayment', note: 'Order created, waiting for payment', by: 'Customer', byRole: 'customer' }],
      });

      await Document.insertMany(
        service.requiredDocs.map((label, i) => ({
          user: req.user.id,
          order: order._id,
          kind: 'upload',
          label,
          uploadedBy: 'Customer',
          ...docFields(byField[`doc_${i}`]),
        }))
      );
      res.status(201).json(order);
    } catch (e) {
      cleanup();
      throw e;
    }
  })
);

// FR-7: my orders
r.get(
  '/',
  ah(async (req, res) => {
    res.json(await Order.find({ user: req.user.id }).sort({ createdAt: -1 }));
  })
);

r.get(
  '/:id',
  ah(async (req, res) => {
    let order = await Order.findOne({ _id: req.params.id, user: req.user.id }).catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    // B2: if a payment is still pending (e.g. browser closed after paying), ask Razorpay now
    if (order.paymentStatus !== 'Paid' && (await Payment.exists({ order: order._id, status: 'Pending' }))) {
      await reconcilePending({ userId: req.user.id });
      order = await Order.findById(order._id);
    }
    const [documents, payments, service] = await Promise.all([
      Document.find({ order: order._id }).select('-fileUrl').sort({ uploadedAt: 1 }),
      Payment.find({ order: order._id }).sort({ createdAt: -1 }),
      Service.findById(order.service).select('steps processingTime notes terms included notIncluded category'),
    ]);
    res.json({ order, documents, payments, service });
  })
);

// Cancel an unpaid order: removes it and its uploaded documents
r.delete(
  '/:id',
  ah(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id }).catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded') {
      throw new HttpError(400, 'This order is already paid. Use "Request cancellation" instead.');
    }
    if (await Payment.exists({ order: order._id, status: 'Pending', createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) } })) {
      throw new HttpError(400, 'A payment for this order may still be in progress. Try again in 15 minutes.');
    }
    const docs = await Document.find({ order: order._id });
    docs.forEach((d) => removeFile(d.fileUrl));
    await Document.deleteMany({ order: order._id });
    await Payment.deleteMany({ order: order._id, status: { $ne: 'Success' } });
    await order.deleteOne();
    res.json({ ok: true });
  })
);

// B3: ask the cafe to cancel a paid order (before work starts). The owner approves and refunds.
r.post(
  '/:id/cancel-request',
  ah(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id }).catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.paymentStatus !== 'Paid') throw new HttpError(400, 'Only paid orders need a cancellation request.');
    if (order.status !== 'Submitted') throw new HttpError(400, 'The cafe has already started on this order. Please call or visit the cafe.');
    if (order.cancelRequest?.status === 'Requested') throw new HttpError(400, 'You have already asked to cancel this order.');
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (reason.length < 3) throw new HttpError(400, 'Tell us briefly why you want to cancel.');
    order.cancelRequest = { status: 'Requested', reason, at: new Date() };
    order.history.push({ status: order.status, note: `Cancellation requested: ${reason}`, by: 'Customer', byRole: 'customer' });
    await order.save();
    res.json(order);
  })
);

export default r;
