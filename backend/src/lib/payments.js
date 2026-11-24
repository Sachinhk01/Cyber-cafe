import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Order, Payment, PrintJob, User, Service, nextNumber } from '../models.js';
import { notifyUser } from './notify.js';
import { buildInvoicePdf, invoiceFileName } from './invoice.js';

// PDF receipt to attach to the confirmation email (never blocks the payment if it fails)
async function receiptAttachment(paymentId) {
  try {
    const p = await Payment.findById(paymentId).populate('order').populate('printJob').populate('user', 'name mobile email');
    return [{ filename: invoiceFileName(p), content: await buildInvoicePdf(p), contentType: 'application/pdf' }];
  } catch (e) {
    console.error('Receipt PDF failed:', e.message);
    return undefined;
  }
}

const isProd = process.env.NODE_ENV === 'production';
// TEST_MODE=1 (never on a live server) forces test payments, e.g. for the automatic tests.
// Keys are trimmed so a stray space in .env does not count as a key.
const testMode = process.env.TEST_MODE === '1' && !isProd;
export const mockMode = testMode || !process.env.RAZORPAY_KEY_ID?.trim() || !process.env.RAZORPAY_KEY_SECRET?.trim();

const rz = mockMode
  ? null
  : new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID.trim(), key_secret: process.env.RAZORPAY_KEY_SECRET.trim() });

// B1 + B2: a live server must never fall back to test payments, and must have the webhook,
// otherwise a customer who closes the browser after paying would stay "unpaid".
export function paymentConfigProblems() {
  if (!isProd) return [];
  const problems = [];
  if (mockMode) problems.push('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production (test payments are off on a live server).');
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) problems.push('RAZORPAY_WEBHOOK_SECRET is required in production. Add the webhook in the Razorpay dashboard (see README).');
  return problems;
}

if (mockMode && !isProd) console.log('Razorpay keys not set: payments run in TEST mode (development only).');

export async function createGatewayOrder(amountRupees, receipt) {
  if (mockMode) return { id: 'mock_order_' + crypto.randomBytes(6).toString('hex') };
  return rz.orders.create({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt });
}

export function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Running counter, so two payments can never get the same receipt number
const receiptNo = async () => {
  const ymd = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10).replace(/-/g, ''); // India date
  const n = await nextNumber('receipt', 'R');
  return `CC-${ymd}-${n.slice(2)}`;
};

// Idempotent: safe to call from checkout verify AND the webhook.
export async function markPaymentSuccess(payment, gatewayPaymentId) {
  const now = new Date();
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: 'Success' } },
    { status: 'Success', razorpayPaymentId: gatewayPaymentId, paidAt: now },
    { new: true }
  );
  if (!updated) return; // already processed

  const user = await User.findById(updated.user);
  const Model = updated.kind === 'order' ? Order : PrintJob;
  const targetId = updated.kind === 'order' ? updated.order : updated.printJob;

  // Price changed after the payment started (e.g. copies edited in another tab):
  // don't mark the item paid; flag the payment for a refund instead.
  const item = await Model.findById(targetId).select('totalAmount price').lean();
  const expected = updated.kind === 'order' ? item?.totalAmount : item?.price;
  if (!item || Number(expected) !== Number(updated.amount)) {
    await Payment.updateOne({ _id: updated._id }, { duplicate: true, mismatch: true });
    console.warn(`Payment ${updated._id} (Rs ${updated.amount}) does not match the price Rs ${expected}. Refund it from the admin panel.`);
    return;
  }

  // The same item was already paid (e.g. paid in two tabs). Keep the first receipt,
  // flag this payment so the owner can refund it from Admin > Payments.
  const alreadyPaid = await Model.exists({ _id: targetId, paymentStatus: { $in: ['Paid', 'Refunded'] } });
  if (alreadyPaid) {
    await Payment.updateOne({ _id: updated._id }, { duplicate: true });
    console.warn(`Duplicate payment ${updated._id} for ${updated.kind} ${targetId}. Refund it from the admin panel.`);
    return;
  }

  if (updated.kind === 'order') {
    const current = await Order.findById(updated.order).select('service').lean();
    const service = current && (await Service.findById(current.service).select('processingDays').lean());
    const days = Number(service?.processingDays) || 0;
    const order = await Order.findByIdAndUpdate(
      updated.order,
      {
        status: 'Submitted',
        paymentStatus: 'Paid',
        receiptNo: await receiptNo(),
        paidAt: now,
        ...(days > 0 ? { expectedBy: new Date(now.getTime() + days * 86400000) } : {}),
        $push: { history: { status: 'Submitted', note: 'Payment received', by: 'System', byRole: 'system', at: now } },
      },
      { new: true }
    );
    await notifyUser(
      user,
      `Payment received - ${order.serviceName}`,
      `Hi ${user.name}, we received Rs ${order.totalAmount} for ${order.serviceName}. Receipt ${order.receiptNo}. We'll update you as it progresses.`,
      user.email ? await receiptAttachment(updated._id) : undefined
    );
  } else {
    const job = await PrintJob.findByIdAndUpdate(
      updated.printJob,
      {
        status: 'Pending',
        paymentStatus: 'Paid',
        receiptNo: await receiptNo(),
        paidAt: now,
        pickupCode: String(crypto.randomInt(1000, 9999)),
      },
      { new: true }
    );
    await notifyUser(
      user,
      'Print job received',
      `Hi ${user.name}, your print job (${job.fileName}) is in the queue. Pickup code: ${job.pickupCode}.`,
      user.email ? await receiptAttachment(updated._id) : undefined
    );
  }
}

export async function markPaymentFailed(payment) {
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'Pending' },
    { status: 'Failed' },
    { new: true }
  );
  if (!updated) return;
  const Model = updated.kind === 'order' ? Order : PrintJob;
  const id = updated.kind === 'order' ? updated.order : updated.printJob;
  await Model.updateOne({ _id: id, paymentStatus: { $nin: ['Paid', 'Refunded'] } }, { paymentStatus: 'Failed' });
}

// Refund a successful payment (full amount by default). Mock payments are refunded instantly.
export async function refundPayment(payment, { amount, reason } = {}) {
  if (payment.status !== 'Success') throw Object.assign(new Error('Only successful payments can be refunded.'), { status: 400 });
  if (payment.refund?.status === 'Processed') throw Object.assign(new Error('This payment is already refunded.'), { status: 400 });
  const value = amount === undefined || amount === '' ? payment.amount : Number(amount);
  if (!(value > 0 && value <= payment.amount)) {
    throw Object.assign(new Error(`Refund must be between Rs 1 and Rs ${payment.amount}.`), { status: 400 });
  }

  let refundId = 'mock_refund_' + crypto.randomBytes(5).toString('hex');
  const isGateway = !payment.mock && payment.razorpayPaymentId && !String(payment.razorpayPaymentId).startsWith('free');
  if (isGateway) {
    if (mockMode) throw Object.assign(new Error('Razorpay keys are not set, so this real payment cannot be refunded here.'), { status: 400 });
    try {
      const r = await rz.payments.refund(payment.razorpayPaymentId, {
        amount: Math.round(value * 100),
        notes: { reason: reason || 'Refund from cafe' },
      });
      refundId = r.id;
    } catch (e) {
      payment.refund = { status: 'Failed', amount: value, reason, at: new Date() };
      await payment.save();
      const msg = e?.error?.description || e.message || 'Razorpay refused the refund.';
      throw Object.assign(new Error(`Refund failed: ${msg}`), { status: 400 });
    }
  }

  payment.refund = { status: 'Processed', amount: value, razorpayRefundId: refundId, reason, at: new Date() };
  await payment.save();

  // A full refund of the payment that paid for the item marks the item as refunded.
  if (!payment.duplicate && value === payment.amount) {
    const Model = payment.kind === 'order' ? Order : PrintJob;
    const id = payment.kind === 'order' ? payment.order : payment.printJob;
    await Model.updateOne({ _id: id }, { paymentStatus: 'Refunded' });
  }

  const user = await User.findById(payment.user);
  await notifyUser(
    user,
    'Refund processed',
    `Hi ${user?.name || ''}, we have refunded Rs ${value}${reason ? ` (${reason})` : ''}. It usually reaches your account in 5-7 working days.`
  );
  return payment;
}

// B2: safety net for when the webhook is missing or delayed. Asks Razorpay about payments
// still "Pending" and marks them paid or failed. Runs every 5 minutes and when a customer
// opens a page with a pending payment.
export async function reconcilePayment(payment) {
  if (mockMode || payment.mock || payment.status !== 'Pending') return payment;
  if (!payment.razorpayOrderId || /^(free_|mock_)/.test(payment.razorpayOrderId)) return payment;
  try {
    const { items = [] } = await rz.orders.fetchPayments(payment.razorpayOrderId);
    const captured = items.find((p) => p.status === 'captured');
    if (captured) await markPaymentSuccess(payment, captured.id);
    else if (items.length && items.every((p) => p.status === 'failed') && Date.now() - new Date(payment.createdAt).getTime() > 30 * 60 * 1000) {
      await markPaymentFailed(payment);
    }
  } catch (e) {
    console.error('Payment check with Razorpay failed:', e?.error?.description || e.message);
  }
  return Payment.findById(payment._id);
}

export async function reconcilePending({ userId } = {}) {
  if (mockMode) return 0;
  const q = { status: 'Pending', mock: false, createdAt: { $gt: new Date(Date.now() - 48 * 3600 * 1000) } };
  if (userId) q.user = userId;
  const pending = await Payment.find(q).limit(50);
  for (const p of pending) await reconcilePayment(p);
  return pending.length;
}

export function startReconcileJob() {
  if (mockMode) return;
  setInterval(() => reconcilePending().catch((e) => console.error('Reconcile failed:', e.message)), 5 * 60 * 1000);
}
