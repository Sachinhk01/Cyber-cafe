import { Router } from 'express';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import {
  Order,
  PrintJob,
  Payment,
  User,
  Document,
  Service,
  AuditLog,
  Notification,
  getSettings,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  PRINT_STATUSES,
} from '../models.js';
import { ah, auth, HttpError, checkStrongPassword } from '../lib/auth.js';
import { notifyUser, retryFailedNotifications } from '../lib/notify.js';
import { refundPayment } from '../lib/payments.js';
import { buildInvoicePdf, invoiceFileName } from '../lib/invoice.js';
import { startOfDayIst, startOfMonthIst, monthRangeIst, dayStartIst, DAY_MS } from '../lib/time.js';
import { upload, removeFile, assertRealFiles, encryptUploads, docFields } from '../lib/upload.js';
import { audit } from '../lib/audit.js';
import { createBackupBuffer, backupFileName } from '../lib/backup.js';

const r = Router();
const owner = auth(['owner']);
r.use(auth(['owner', 'staff']));

async function setDocExpiry(filter) {
  const { retentionDays } = await getSettings();
  await Document.updateMany(filter, { expiresAt: new Date(Date.now() + retentionDays * DAY_MS) });
}

// Order re-opened (e.g. Completed -> In Progress): keep its documents again
const clearDocExpiry = (filter) => Document.updateMany(filter, { $unset: { expiresAt: 1 } });

// Revenue is counted on the day the payment succeeded. Old rows without paidAt fall back to updatedAt.
const PAID_AT = { $ifNull: ['$paidAt', '$updatedAt'] };
const paidBetween = (from, to) => ({
  $expr: { $and: [{ $gte: [PAID_AT, from] }, ...(to ? [{ $lt: [PAID_AT, to] }] : [])] },
});

// FR-31 dashboard numbers
r.get(
  '/stats',
  owner,
  ah(async (req, res) => {
    const today = startOfDayIst();
    const month = startOfMonthIst();
    const since = new Date(today.getTime() - 13 * DAY_MS);
    // Net revenue = payments received minus refunds
    const sum = (match) =>
      Payment.aggregate([
        { $match: { status: 'Success', ...match } },
        { $group: { _id: null, t: { $sum: { $subtract: ['$amount', { $ifNull: ['$refund.amount', 0] }] } } } },
      ]).then((x) => x[0]?.t || 0);

    const [todayRevenue, monthRevenue, todayOrders, openOrders, printQueue, perService, daily, refundsDue, cancelRequests, failedNotifications, rejectedUnrefunded] =
      await Promise.all([
        sum(paidBetween(today)),
        sum(paidBetween(month)),
        Order.countDocuments({ paidAt: { $gte: today } }),
        Order.countDocuments({ status: { $in: ['Submitted', 'In Progress'] } }),
        PrintJob.countDocuments({ status: { $in: ['Pending', 'Printing'] } }),
        Order.aggregate([
          { $match: { paidAt: { $gte: month } } },
          { $group: { _id: '$serviceName', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
          { $sort: { orders: -1 } },
        ]),
        Payment.aggregate([
          { $match: { status: 'Success', ...paidBetween(since) } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: PAID_AT, timezone: 'Asia/Kolkata' } },
              revenue: { $sum: { $subtract: ['$amount', { $ifNull: ['$refund.amount', 0] }] } },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Payment.countDocuments({ status: 'Success', duplicate: true, 'refund.status': { $ne: 'Processed' } }),
        Order.countDocuments({ 'cancelRequest.status': 'Requested' }),
        Notification.countDocuments({ status: { $in: ['failed', 'gave-up'] }, createdAt: { $gt: new Date(Date.now() - 7 * DAY_MS) } }),
        Order.countDocuments({ status: 'Rejected', paymentStatus: 'Paid', totalAmount: { $gt: 0 } }),
      ]);
    res.json({
      todayRevenue,
      monthRevenue,
      todayOrders,
      openOrders,
      printQueue,
      perService,
      daily,
      refundsDue,
      cancelRequests,
      failedNotifications,
      rejectedUnrefunded,
    });
  })
);

// FR-26 orders with filters (+ search by order number, customer name or mobile)
r.get(
  '/orders',
  ah(async (req, res) => {
    const { status, service, from, to, q: search, cancel } = req.query;
    const q = {};
    if (status) q.status = status;
    else q.status = { $ne: 'PendingPayment' }; // unpaid drafts hidden by default
    if (cancel === '1') q['cancelRequest.status'] = 'Requested';
    if (service) {
      if (!/^[a-f\d]{24}$/i.test(service)) throw new HttpError(400, 'Unknown service.');
      q.service = service;
    }
    const fromD = dayStartIst(from);
    const toD = dayStartIst(to);
    if (fromD || toD) {
      q.createdAt = {};
      if (fromD) q.createdAt.$gte = fromD;
      if (toD) q.createdAt.$lt = new Date(toD.getTime() + DAY_MS);
    }
    const term = String(search || '').trim();
    if (term) {
      const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await User.find({ role: 'customer', $or: [{ name: rx }, { mobile: rx }] }).select('_id').limit(200).lean();
      q.$or = [{ orderNo: rx }, { referenceNo: rx }, { serviceName: rx }, { user: { $in: users.map((u) => u._id) } }];
    }
    res.json(await Order.find(q).sort({ createdAt: -1 }).limit(500).populate('user', 'name mobile email'));
  })
);

async function orderBundle(id) {
  const order = await Order.findById(id).populate('user', 'name mobile email').catch(() => null);
  if (!order) throw new HttpError(404, 'Order not found.');
  const [documents, payments, service] = await Promise.all([
    Document.find({ order: order._id }).select('-fileUrl').sort({ uploadedAt: 1 }),
    Payment.find({ order: order._id }).sort({ createdAt: -1 }),
    Service.findById(order.service).select('steps processingTime processingDays notes terms'),
  ]);
  return { order, documents, payments, service, nextStatuses: ORDER_TRANSITIONS[order.status] || [] };
}

r.get(
  '/orders/:id',
  ah(async (req, res) => {
    res.json(await orderBundle(req.params.id));
  })
);

// Refund every successful (not already refunded, not duplicate) payment of an order
async function refundOrderPayments(order, reason) {
  const pays = await Payment.find({ order: order._id, status: 'Success', duplicate: { $ne: true }, 'refund.status': { $ne: 'Processed' }, amount: { $gt: 0 } });
  let total = 0;
  for (const p of pays) {
    await refundPayment(p, { reason });
    total += p.amount;
  }
  return total;
}

// FR-27 update status + remark + reference number + expected date, FR-24 notify.
// E3: only allowed moves; every change is kept in the order's history.
// B3: "Reject and refund" in one step (owner only).
r.patch(
  '/orders/:id',
  ah(async (req, res) => {
    const { status, remark, referenceNo, expectedBy, refund } = req.body;
    const order = await Order.findById(req.params.id).populate('user').catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (!['Paid', 'Refunded'].includes(order.paymentStatus)) throw new HttpError(400, 'This order has not been paid yet.');

    const newStatus = status || order.status;
    if (!ORDER_STATUSES.includes(newStatus) || newStatus === 'PendingPayment') throw new HttpError(400, 'Pick a valid status.');
    const changed = order.status !== newStatus;
    if (changed && !(ORDER_TRANSITIONS[order.status] || []).includes(newStatus)) {
      const allowed = ORDER_TRANSITIONS[order.status] || [];
      throw new HttpError(
        400,
        allowed.length ? `A ${order.status} order can only move to: ${allowed.join(', ')}.` : `A ${order.status} order is final and can't be changed.`
      );
    }
    if (changed && newStatus === 'In Progress' && order.status === 'Completed' && req.user.role !== 'owner') {
      throw new HttpError(403, 'Only the owner can re-open a completed order.');
    }
    if (refund && req.user.role !== 'owner') throw new HttpError(403, 'Only the owner can refund. Reject the order and ask the owner to refund it.');

    const newRemark = remark !== undefined ? String(remark).trim().slice(0, 1000) : order.remark;
    const newRef = referenceNo !== undefined ? String(referenceNo).trim().slice(0, 60) : order.referenceNo;
    let newExpected = order.expectedBy;
    if (expectedBy !== undefined) {
      newExpected = expectedBy ? dayStartIst(String(expectedBy)) : undefined;
      if (expectedBy && !newExpected) throw new HttpError(400, 'Pick a valid expected date.');
    }
    const sameDate = (a, b) => (a ? new Date(a).getTime() : 0) === (b ? new Date(b).getTime() : 0);
    const somethingChanged = changed || newRemark !== order.remark || newRef !== (order.referenceNo || '') || !sameDate(newExpected, order.expectedBy);
    if (!somethingChanged && !refund) return res.json(await orderBundle(order._id)); // nothing to save or notify

    const notes = [];
    if (newRef !== (order.referenceNo || '')) notes.push(`Reference no. ${newRef || 'removed'}`);
    if (!sameDate(newExpected, order.expectedBy) && newExpected) notes.push(`Expected by ${newExpected.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    if (newRemark !== order.remark && newRemark) notes.push(newRemark);
    if (refund && newStatus === 'Rejected') notes.push('Payment refunded');

    order.status = newStatus;
    order.remark = newRemark;
    order.referenceNo = newRef;
    order.expectedBy = newExpected;
    order.history.push({ status: newStatus, note: notes.join(' · '), by: req.user.name, byRole: req.user.role });
    // A rejected order closes any open cancellation request
    if (newStatus === 'Rejected' && order.cancelRequest?.status === 'Requested') {
      order.cancelRequest.status = 'Approved';
      order.cancelRequest.decidedAt = new Date();
      order.cancelRequest.decidedBy = req.user.name;
    }
    await order.save();

    let refunded = 0;
    if (refund && newStatus === 'Rejected') {
      refunded = await refundOrderPayments(order, `Order rejected${newRemark ? ': ' + newRemark : ''}`);
      await audit(req, 'payment.refunded', { targetType: 'order', targetId: order._id, summary: `${order.orderNo}: refunded Rs ${refunded} on rejection` });
    }

    if (['Completed', 'Rejected'].includes(newStatus)) await setDocExpiry({ order: order._id });
    else await clearDocExpiry({ order: order._id });

    await audit(req, changed ? 'order.status' : 'order.updated', {
      targetType: 'order',
      targetId: order._id,
      summary: `${order.orderNo || ''} ${order.serviceName}: ${changed ? `-> ${newStatus}` : 'details'}${notes.length ? ' (' + notes.join('; ') + ')' : ''}`,
    });
    const refText = order.referenceNo ? ` Reference no: ${order.referenceNo}.` : '';
    await notifyUser(
      order.user,
      `Order update: ${order.serviceName} is ${newStatus}`,
      `Hi ${order.user.name}, your ${order.serviceName} order ${order.orderNo || ''} is now "${newStatus}".${refText}${order.remark ? ' Note: ' + order.remark : ''}${
        refunded ? ` We have refunded Rs ${refunded}; it reaches your account in 5-7 working days.` : ''
      }`
    );
    res.json(await orderBundle(order._id));
  })
);

// B3: owner answers a customer's cancellation request
r.post(
  '/orders/:id/cancel-decision',
  owner,
  ah(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user').catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.cancelRequest?.status !== 'Requested') throw new HttpError(400, 'There is no open cancellation request on this order.');
    const note = String(req.body.note || '').trim().slice(0, 300);
    const approve = req.body.approve === true;
    order.cancelRequest.status = approve ? 'Approved' : 'Declined';
    order.cancelRequest.decidedAt = new Date();
    order.cancelRequest.decidedBy = req.user.name;
    order.cancelRequest.note = note;
    let refunded = 0;
    if (approve) {
      order.status = 'Rejected';
      order.history.push({ status: 'Rejected', note: `Cancelled at customer's request${note ? ' · ' + note : ''}`, by: req.user.name, byRole: req.user.role });
      await order.save();
      refunded = await refundOrderPayments(order, 'Cancelled at your request');
      await setDocExpiry({ order: order._id });
    } else {
      order.history.push({ status: order.status, note: `Cancellation declined${note ? ': ' + note : ''}`, by: req.user.name, byRole: req.user.role });
      await order.save();
    }
    await audit(req, approve ? 'order.cancel-approved' : 'order.cancel-declined', {
      targetType: 'order',
      targetId: order._id,
      summary: `${order.orderNo || ''} ${order.serviceName}${refunded ? `, refunded Rs ${refunded}` : ''}`,
    });
    await notifyUser(
      order.user,
      approve ? 'Your order was cancelled' : 'Cancellation request declined',
      approve
        ? `Hi ${order.user.name}, your ${order.serviceName} order ${order.orderNo || ''} is cancelled.${refunded ? ` We refunded Rs ${refunded}; it reaches your account in 5-7 working days.` : ''}`
        : `Hi ${order.user.name}, we could not cancel your ${order.serviceName} order ${order.orderNo || ''}.${note ? ' ' + note : ''}`
    );
    res.json(await orderBundle(order._id));
  })
);

// E1: attach finished work (e.g. the typed resume, the acknowledgement slip) for the customer to download
r.post(
  '/orders/:id/results',
  upload.array('files', 5),
  ah(async (req, res) => {
    const files = req.files || [];
    try {
      const order = await Order.findById(req.params.id).populate('user').catch(() => null);
      if (!order) throw new HttpError(404, 'Order not found.');
      if (!['Paid', 'Refunded'].includes(order.paymentStatus)) throw new HttpError(400, 'This order has not been paid yet.');
      if (!files.length) throw new HttpError(400, 'Choose at least one file to send.');
      await assertRealFiles(files);
      await encryptUploads(files);
      const label = String(req.body.label || '').trim().slice(0, 80) || 'Finished document';
      await Document.insertMany(
        files.map((f) => ({ user: order.user._id, order: order._id, kind: 'result', label, uploadedBy: req.user.name, ...docFields(f) }))
      );
      if (['Completed', 'Rejected'].includes(order.status)) await setDocExpiry({ order: order._id });
      order.history.push({ status: order.status, note: `${files.length} file${files.length > 1 ? 's' : ''} ready to download: ${label}`, by: req.user.name, byRole: req.user.role });
      await order.save();
      await audit(req, 'order.result-uploaded', { targetType: 'order', targetId: order._id, summary: `${order.orderNo || ''}: ${files.map((f) => f.originalname).join(', ')}` });
      await notifyUser(
        order.user,
        `Your ${order.serviceName} files are ready`,
        `Hi ${order.user.name}, the cafe added "${label}" to your ${order.serviceName} order ${order.orderNo || ''}. Open the order in the app to download it.`
      );
      res.status(201).json(await orderBundle(order._id));
    } catch (e) {
      files.forEach((f) => removeFile(f.path));
      throw e;
    }
  })
);

r.delete(
  '/orders/:id/results/:docId',
  ah(async (req, res) => {
    const doc = await Document.findOne({ _id: req.params.docId, order: req.params.id, kind: 'result' }).catch(() => null);
    if (!doc) throw new HttpError(404, 'File not found.');
    removeFile(doc.fileUrl);
    await doc.deleteOne();
    await audit(req, 'order.result-removed', { targetType: 'order', targetId: req.params.id, summary: doc.originalName });
    res.json(await orderBundle(req.params.id));
  })
);

// FR-21 print queue
r.get(
  '/print-jobs',
  ah(async (req, res) => {
    const q = req.query.status ? { status: req.query.status } : { status: { $nin: ['PendingPayment', 'Collected'] } };
    const jobs = await PrintJob.find(q).sort({ createdAt: req.query.status === 'Collected' ? -1 : 1 }).limit(500).populate('user', 'name mobile').lean();
    const docs = await Document.find({ printJob: { $in: jobs.map((j) => j._id) } }).select('_id printJob originalName').lean();
    const docByJob = Object.fromEntries(docs.map((d) => [String(d.printJob), d]));
    res.json(jobs.map((j) => ({ ...j, documentId: docByJob[String(j._id)]?._id, documentName: docByJob[String(j._id)]?.originalName })));
  })
);

const PRINT_NEXT = { Pending: ['Printing'], Printing: ['Ready', 'Pending'], Ready: ['Collected', 'Printing'], Collected: [] };

r.patch(
  '/print-jobs/:id',
  ah(async (req, res) => {
    const { status, pickupCode } = req.body;
    if (!PRINT_STATUSES.includes(status) || status === 'PendingPayment') throw new HttpError(400, 'Pick a valid status.');
    const job = await PrintJob.findById(req.params.id).populate('user').catch(() => null);
    if (!job) throw new HttpError(404, 'Print job not found.');
    if (job.paymentStatus !== 'Paid') throw new HttpError(400, 'This job has not been paid yet.');
    if (job.status === status) return res.json(job);
    if (!(PRINT_NEXT[job.status] || []).includes(status)) throw new HttpError(400, `A ${job.status} job can't move to ${status}.`);
    if (status === 'Collected' && String(pickupCode || '').trim() !== job.pickupCode)
      throw new HttpError(400, 'Pickup code does not match. Ask the customer for the code in their app.');
    job.status = status;
    await job.save();
    await audit(req, 'print.status', { targetType: 'printJob', targetId: job._id, summary: `${job.jobNo || ''} ${job.fileName} -> ${status}` });
    if (status === 'Ready') {
      await notifyUser(job.user, 'Your printout is ready', `Hi ${job.user.name}, your printout (${job.fileName}) is ready. Show pickup code ${job.pickupCode} at the counter.`);
    }
    if (status === 'Collected') await setDocExpiry({ printJob: job._id });
    res.json(job);
  })
);

// FR-28 transactions
r.get(
  '/payments',
  owner,
  ah(async (req, res) => {
    const q = req.query.status ? { status: req.query.status } : {};
    res.json(
      await Payment.find(q)
        .sort({ createdAt: -1 })
        .limit(500)
        .populate('user', 'name mobile')
        .populate('order', 'serviceName receiptNo')
        .populate('printJob', 'fileName receiptNo')
    );
  })
);

// Admin copy of any receipt PDF
r.get(
  '/payments/:id/invoice.pdf',
  ah(async (req, res) => {
    const payment = await Payment.findOne({ _id: req.params.id, status: 'Success' })
      .populate('order')
      .populate('printJob')
      .populate('user', 'name mobile email')
      .catch(() => null);
    if (!payment) throw new HttpError(404, 'Receipt not found.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceFileName(payment)}"`);
    res.send(await buildInvoicePdf(payment));
  })
);

// Refund a payment (owner only). Body: { amount?, reason? } - amount empty = full refund
r.post(
  '/payments/:id/refund',
  owner,
  ah(async (req, res) => {
    const payment = await Payment.findById(req.params.id).catch(() => null);
    if (!payment) throw new HttpError(404, 'Payment not found.');
    const reason = String(req.body.reason || '').trim().slice(0, 200);
    await refundPayment(payment, { amount: req.body.amount, reason });
    await audit(req, 'payment.refunded', {
      targetType: 'payment',
      targetId: payment._id,
      summary: `Rs ${payment.refund?.amount ?? req.body.amount} of Rs ${payment.amount}${reason ? ` (${reason})` : ''}`,
    });
    res.json(await Payment.findById(payment._id).populate('user', 'name mobile').populate('order', 'serviceName receiptNo').populate('printJob', 'fileName receiptNo'));
  })
);

// FR-29 customers + monthly tracking
r.get(
  '/customers',
  owner,
  ah(async (req, res) => {
    const [customers, spend, signups, active] = await Promise.all([
      User.find({ role: 'customer' }).sort({ createdAt: -1 }).lean(),
      Payment.aggregate([{ $match: { status: 'Success' } }, { $group: { _id: '$user', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      User.aggregate([
        { $match: { role: 'customer' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),
      // Customers who paid at least once in each month (returning + new)
      Payment.aggregate([
        { $match: { status: 'Success' } },
        { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: PAID_AT, timezone: 'Asia/Kolkata' } }, u: '$user' } } },
        { $group: { _id: '$_id.m', active: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),
    ]);
    const byUser = Object.fromEntries(spend.map((s) => [String(s._id), s]));
    res.json({
      customers: customers.map((c) => ({ ...c, totalSpent: byUser[String(c._id)]?.total || 0, payments: byUser[String(c._id)]?.count || 0 })),
      monthly: mergeMonthly(signups, active),
    });
  })
);

function mergeMonthly(signups, active) {
  const map = {};
  signups.forEach((m) => (map[m._id] = { _id: m._id, count: m.count, active: 0 }));
  active.forEach((m) => (map[m._id] = { ...(map[m._id] || { _id: m._id, count: 0 }), active: m.active }));
  return Object.values(map).sort((a, b) => (a._id < b._id ? 1 : -1)).slice(0, 12);
}

// FR-30 monthly Excel export: ?month=2026-11
r.get(
  '/reports/export',
  owner,
  ah(async (req, res) => {
    const range = monthRangeIst(req.query.month);
    if (!range) throw new HttpError(400, 'Pick a month.');
    const { from, to } = range;

    const [customers, payments] = await Promise.all([
      User.find({ role: 'customer', createdAt: { $gte: from, $lt: to } }).sort({ createdAt: 1 }),
      Payment.find({ createdAt: { $gte: from, $lt: to } })
        .sort({ createdAt: 1 })
        .populate('user', 'name mobile')
        .populate('order', 'serviceName receiptNo')
        .populate('printJob', 'fileName receiptNo'),
    ]);

    const wb = new ExcelJS.Workbook();
    const cs = wb.addWorksheet('New customers');
    cs.columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Mobile', key: 'mobile', width: 14 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Registered on', key: 'createdAt', width: 20 },
    ];
    customers.forEach((c) => cs.addRow({ name: c.name, mobile: c.mobile, email: c.email, createdAt: c.createdAt }));

    // Sheet 3: per-service summary for the month (FR-31 in the report too)
    const perService = await Order.aggregate([
      { $match: { paidAt: { $gte: from, $lt: to } } },
      { $group: { _id: '$serviceName', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
      { $sort: { orders: -1 } },
    ]);
    const ss = wb.addWorksheet('By service');
    ss.columns = [
      { header: 'Service', key: 'name', width: 32 },
      { header: 'Paid orders', key: 'orders', width: 12 },
      { header: 'Revenue (Rs)', key: 'revenue', width: 14 },
    ];
    perService.forEach((x) => ss.addRow({ name: x._id, orders: x.orders, revenue: x.revenue }));
    ss.getRow(1).font = { bold: true };

    const ts = wb.addWorksheet('Transactions');
    ts.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Customer', key: 'customer', width: 22 },
      { header: 'Mobile', key: 'mobile', width: 14 },
      { header: 'Type', key: 'kind', width: 10 },
      { header: 'Item', key: 'item', width: 28 },
      { header: 'Receipt', key: 'receipt', width: 20 },
      { header: 'Amount (Rs)', key: 'amount', width: 12 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Refunded (Rs)', key: 'refunded', width: 13 },
      { header: 'Razorpay payment ID', key: 'rzp', width: 24 },
    ];
    let total = 0;
    let refunded = 0;
    payments.forEach((p) => {
      const ref = p.refund?.status === 'Processed' ? p.refund.amount : 0;
      if (p.status === 'Success') total += p.amount;
      refunded += ref;
      ts.addRow({
        date: p.createdAt,
        customer: p.user?.name,
        mobile: p.user?.mobile,
        kind: p.kind,
        item: p.kind === 'order' ? p.order?.serviceName : p.printJob?.fileName,
        receipt: (p.order || p.printJob)?.receiptNo || '',
        amount: p.amount,
        status: p.mock ? `${p.status} (test)` : p.status,
        refunded: ref || '',
        rzp: p.razorpayPaymentId || '',
      });
    });
    ts.addRow({});
    ts.addRow({ item: 'Total collected', amount: total }).font = { bold: true };
    ts.addRow({ item: 'Total refunded', amount: refunded }).font = { bold: true };
    ts.addRow({ item: 'Net revenue', amount: total - refunded }).font = { bold: true };
    ts.getColumn('date').numFmt = 'dd-mmm-yyyy hh:mm';
    cs.getColumn('createdAt').numFmt = 'dd-mmm-yyyy';
    [cs, ts].forEach((s) => (s.getRow(1).font = { bold: true }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="cyber-cafe-report-${req.query.month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  })
);

// Print rates, retention, cafe details, opening hours and refund policy
r.get(
  '/settings',
  owner,
  ah(async (req, res) => {
    res.json(await getSettings());
  })
);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
r.put(
  '/settings',
  owner,
  ah(async (req, res) => {
    const s = await getSettings();
    const b = req.body || {};
    if (b.printRates) {
      for (const mode of ['bw', 'color'])
        for (const size of ['A4', 'A3']) {
          const v = Number(b.printRates?.[mode]?.[size]);
          if (!Number.isFinite(v) || v < 0 || v > 10000) throw new HttpError(400, 'Enter valid print rates.');
          s.printRates[mode][size] = v;
        }
    }
    if (b.retentionDays !== undefined) {
      const days = parseInt(b.retentionDays, 10);
      if (!(days >= 1 && days <= 365)) throw new HttpError(400, 'Keep documents for 1 to 365 days.');
      s.retentionDays = days;
    }
    if (b.cafeName !== undefined) {
      const name = String(b.cafeName).trim().slice(0, 60);
      if (!name) throw new HttpError(400, 'Enter the cafe name.');
      s.cafeName = name;
    }
    if (b.cafePhone !== undefined) s.cafePhone = String(b.cafePhone).trim().slice(0, 30);
    if (b.cafeAddress !== undefined) s.cafeAddress = String(b.cafeAddress).trim().slice(0, 200);
    if (b.openTime !== undefined || b.closeTime !== undefined) {
      const open = String(b.openTime ?? s.openTime);
      const close = String(b.closeTime ?? s.closeTime);
      if (!TIME_RE.test(open) || !TIME_RE.test(close) || open >= close) throw new HttpError(400, 'Enter opening and closing times like 09:00 and 20:00.');
      s.openTime = open;
      s.closeTime = close;
    }
    if (b.openDays !== undefined) {
      const days = [...new Set((Array.isArray(b.openDays) ? b.openDays : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
      s.openDays = days;
    }
    if (b.heroImage !== undefined) {
      const url = String(b.heroImage).trim();
      if (url && !/^https:\/\/\S+$/i.test(url)) throw new HttpError(400, 'The banner image must be an https:// link (or leave it empty).');
      s.heroImage = url.slice(0, 500);
    }
    if (b.refundPolicy !== undefined) {
      const text = String(b.refundPolicy).trim();
      if (text.length < 20) throw new HttpError(400, 'Write the refund policy (at least one sentence).');
      s.refundPolicy = text.slice(0, 3000);
    }
    await s.save();
    await audit(req, 'settings.updated', { targetType: 'settings', summary: Object.keys(b).join(', ') });
    res.json(s);
  })
);

// Staff accounts (owner manages)
r.get(
  '/staff',
  owner,
  ah(async (req, res) => {
    res.json(await User.find({ role: { $in: ['owner', 'staff'] } }).sort({ createdAt: 1 }));
  })
);

r.post(
  '/staff',
  owner,
  ah(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !email) throw new HttpError(400, 'Name and email are required.');
    const weak = checkStrongPassword(password);
    if (weak) throw new HttpError(400, `Staff password: ${weak}`);
    if (await User.exists({ email, role: { $in: ['owner', 'staff'] } })) throw new HttpError(409, 'That email already has a login.');
    const u = await User.create({ name, email, role: 'staff', passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true });
    await audit(req, 'staff.added', { targetType: 'user', targetId: u._id, summary: `${name} <${email}>` });
    res.status(201).json({ id: u._id, name: u.name, email: u.email, role: u.role });
  })
);

r.delete(
  '/staff/:id',
  owner,
  ah(async (req, res) => {
    const u = await User.findOne({ _id: req.params.id, role: 'staff' }).catch(() => null);
    if (!u) throw new HttpError(404, 'Staff login not found.');
    await u.deleteOne();
    await audit(req, 'staff.removed', { targetType: 'user', targetId: u._id, summary: `${u.name} <${u.email}>` });
    res.json({ ok: true });
  })
);

// D8: activity log for the owner
r.get(
  '/audit',
  owner,
  ah(async (req, res) => {
    const q = {};
    if (req.query.action) q.action = new RegExp('^' + String(req.query.action).replace(/[^a-z.-]/gi, ''));
    if (req.query.actor && /^[a-f\d]{24}$/i.test(req.query.actor)) q.actor = req.query.actor;
    if (req.query.targetId) q.targetId = String(req.query.targetId);
    res.json(await AuditLog.find(q).sort({ at: -1 }).limit(300));
  })
);

// E4: messages that could not be delivered
r.get(
  '/notifications',
  owner,
  ah(async (req, res) => {
    const q = req.query.status === 'all' ? {} : { status: { $in: ['failed', 'gave-up'] } };
    res.json(await Notification.find(q).sort({ createdAt: -1 }).limit(200).populate('user', 'name mobile'));
  })
);

r.post(
  '/notifications/retry',
  owner,
  ah(async (req, res) => {
    // retry everything that failed, now (ignores the 10-minute wait)
    await Notification.updateMany({ status: { $in: ['failed', 'gave-up'] } }, { status: 'failed', updatedAt: new Date(0) }, { timestamps: false });
    const tried = await retryFailedNotifications();
    res.json({ tried, stillFailing: await Notification.countDocuments({ status: { $in: ['failed', 'gave-up'] } }) });
  })
);

// C2: owner downloads an encrypted copy of the database to keep off the server
r.get(
  '/backup/download',
  owner,
  ah(async (req, res) => {
    const data = await createBackupBuffer();
    await audit(req, 'backup.downloaded', { targetType: 'backup', summary: `${Math.round(data.length / 1024)} KB` });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${backupFileName()}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  })
);

// Services list for filters
r.get(
  '/service-options',
  ah(async (req, res) => {
    res.json(await Service.find().select('name').sort({ name: 1 }));
  })
);

export default r;
