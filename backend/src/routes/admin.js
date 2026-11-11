import { Router } from 'express';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { Order, PrintJob, Payment, User, Document, Service, getSettings, ORDER_STATUSES, PRINT_STATUSES } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';
import { notifyUser } from '../lib/notify.js';

const r = Router();
const owner = auth(['owner']);
r.use(auth(['owner', 'staff']));

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

async function setDocExpiry(filter) {
  const { retentionDays } = await getSettings();
  await Document.updateMany(filter, { expiresAt: new Date(Date.now() + retentionDays * 86400000) });
}

// FR-31 dashboard numbers
r.get(
  '/stats',
  owner,
  ah(async (req, res) => {
    const today = startOfDay();
    const month = startOfMonth();
    const since = new Date(today.getTime() - 13 * 86400000);
    const sum = (match) =>
      Payment.aggregate([{ $match: { status: 'Success', ...match } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).then(
        (x) => x[0]?.t || 0
      );

    const [todayRevenue, monthRevenue, todayOrders, openOrders, printQueue, perService, daily] = await Promise.all([
      sum({ updatedAt: { $gte: today } }),
      sum({ updatedAt: { $gte: month } }),
      Order.countDocuments({ paidAt: { $gte: today } }),
      Order.countDocuments({ status: { $in: ['Submitted', 'In Progress'] } }),
      PrintJob.countDocuments({ status: { $in: ['Pending', 'Printing'] } }),
      Order.aggregate([
        { $match: { paidAt: { $gte: month } } },
        { $group: { _id: '$serviceName', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { orders: -1 } },
      ]),
      Payment.aggregate([
        { $match: { status: 'Success', updatedAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt', timezone: 'Asia/Kolkata' } },
            revenue: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({ todayRevenue, monthRevenue, todayOrders, openOrders, printQueue, perService, daily });
  })
);

// FR-26 orders with filters
r.get(
  '/orders',
  ah(async (req, res) => {
    const { status, service, from, to } = req.query;
    const q = {};
    if (status) q.status = status;
    else q.status = { $ne: 'PendingPayment' }; // unpaid drafts hidden by default
    if (service) q.service = service;
    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(from);
      if (to) q.createdAt.$lte = new Date(new Date(to).getTime() + 86400000 - 1);
    }
    res.json(await Order.find(q).sort({ createdAt: -1 }).limit(500).populate('user', 'name mobile email'));
  })
);

r.get(
  '/orders/:id',
  ah(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name mobile email').catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    const [documents, payments] = await Promise.all([
      Document.find({ order: order._id }).select('-fileUrl'),
      Payment.find({ order: order._id }).sort({ createdAt: -1 }),
    ]);
    res.json({ order, documents, payments });
  })
);

// FR-27 update status + remark, FR-24 notify
r.patch(
  '/orders/:id',
  ah(async (req, res) => {
    const { status, remark } = req.body;
    if (!ORDER_STATUSES.includes(status) || status === 'PendingPayment') throw new HttpError(400, 'Pick a valid status.');
    const order = await Order.findById(req.params.id).populate('user').catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.paymentStatus !== 'Paid') throw new HttpError(400, 'This order has not been paid yet.');
    order.status = status;
    if (remark !== undefined) order.remark = String(remark).trim();
    await order.save();
    if (['Completed', 'Rejected'].includes(status)) await setDocExpiry({ order: order._id });
    await notifyUser(
      order.user,
      `Order update: ${order.serviceName} is ${status}`,
      `Hi ${order.user.name}, your ${order.serviceName} order is now "${status}".${order.remark ? ' Note: ' + order.remark : ''}`
    );
    res.json(order);
  })
);

// FR-21 print queue
r.get(
  '/print-jobs',
  ah(async (req, res) => {
    const q = req.query.status ? { status: req.query.status } : { status: { $ne: 'PendingPayment' } };
    const jobs = await PrintJob.find(q).sort({ createdAt: 1 }).limit(500).populate('user', 'name mobile').lean();
    const docs = await Document.find({ printJob: { $in: jobs.map((j) => j._id) } }).select('_id printJob').lean();
    const docByJob = Object.fromEntries(docs.map((d) => [String(d.printJob), d._id]));
    res.json(jobs.map((j) => ({ ...j, documentId: docByJob[String(j._id)] })));
  })
);

r.patch(
  '/print-jobs/:id',
  ah(async (req, res) => {
    const { status, pickupCode } = req.body;
    if (!PRINT_STATUSES.includes(status) || status === 'PendingPayment') throw new HttpError(400, 'Pick a valid status.');
    const job = await PrintJob.findById(req.params.id).populate('user').catch(() => null);
    if (!job) throw new HttpError(404, 'Print job not found.');
    if (job.paymentStatus !== 'Paid') throw new HttpError(400, 'This job has not been paid yet.');
    if (status === 'Collected' && String(pickupCode || '').trim() !== job.pickupCode)
      throw new HttpError(400, 'Pickup code does not match. Ask the customer for the code in their app.');
    job.status = status;
    await job.save();
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

// FR-29 customers + monthly tracking
r.get(
  '/customers',
  owner,
  ah(async (req, res) => {
    const [customers, spend, monthly] = await Promise.all([
      User.find({ role: 'customer' }).sort({ createdAt: -1 }).lean(),
      Payment.aggregate([{ $match: { status: 'Success' } }, { $group: { _id: '$user', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      User.aggregate([
        { $match: { role: 'customer' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),
    ]);
    const byUser = Object.fromEntries(spend.map((s) => [String(s._id), s]));
    res.json({
      customers: customers.map((c) => ({ ...c, totalSpent: byUser[String(c._id)]?.total || 0, payments: byUser[String(c._id)]?.count || 0 })),
      monthly,
    });
  })
);

// FR-30 monthly Excel export: ?month=2026-11
r.get(
  '/reports/export',
  owner,
  ah(async (req, res) => {
    const m = /^(\d{4})-(\d{2})$/.exec(req.query.month || '');
    if (!m) throw new HttpError(400, 'Pick a month.');
    const from = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    const to = new Date(Number(m[1]), Number(m[2]), 1);

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
      { header: 'Razorpay payment ID', key: 'rzp', width: 24 },
    ];
    let total = 0;
    payments.forEach((p) => {
      if (p.status === 'Success') total += p.amount;
      ts.addRow({
        date: p.createdAt,
        customer: p.user?.name,
        mobile: p.user?.mobile,
        kind: p.kind,
        item: p.kind === 'order' ? p.order?.serviceName : p.printJob?.fileName,
        receipt: (p.order || p.printJob)?.receiptNo || '',
        amount: p.amount,
        status: p.status,
        rzp: p.razorpayPaymentId || '',
      });
    });
    ts.addRow({});
    ts.addRow({ item: 'Total collected', amount: total }).font = { bold: true };
    [cs, ts].forEach((s) => (s.getRow(1).font = { bold: true }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="cyber-cafe-report-${req.query.month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  })
);

// Print rates + retention
r.get(
  '/settings',
  owner,
  ah(async (req, res) => {
    res.json(await getSettings());
  })
);

r.put(
  '/settings',
  owner,
  ah(async (req, res) => {
    const s = await getSettings();
    const rates = req.body.printRates || {};
    for (const mode of ['bw', 'color'])
      for (const size of ['A4', 'A3']) {
        const v = Number(rates?.[mode]?.[size]);
        if (!Number.isFinite(v) || v < 0) throw new HttpError(400, 'Enter valid print rates.');
        s.printRates[mode][size] = v;
      }
    const days = parseInt(req.body.retentionDays, 10);
    if (!(days >= 1 && days <= 365)) throw new HttpError(400, 'Keep documents for 1 to 365 days.');
    s.retentionDays = days;
    await s.save();
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
    if (password.length < 8) throw new HttpError(400, 'Password needs at least 8 characters.');
    if (await User.exists({ email, role: { $in: ['owner', 'staff'] } })) throw new HttpError(409, 'That email already has a login.');
    const u = await User.create({ name, email, role: 'staff', passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ id: u._id, name: u.name, email: u.email, role: u.role });
  })
);

r.delete(
  '/staff/:id',
  owner,
  ah(async (req, res) => {
    await User.deleteOne({ _id: req.params.id, role: 'staff' });
    res.json({ ok: true });
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
