import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Order, Payment, PrintJob, User } from '../models.js';
import { notifyUser } from './notify.js';

export const mockMode = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;

const rz = mockMode
  ? null
  : new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

if (mockMode) console.log('Razorpay keys not set: payments run in MOCK mode.');

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

const receiptNo = () => {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `CC-${ymd}-${crypto.randomInt(1000, 9999)}`;
};

// Idempotent: safe to call from checkout verify AND the webhook.
export async function markPaymentSuccess(payment, gatewayPaymentId) {
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: 'Success' } },
    { status: 'Success', razorpayPaymentId: gatewayPaymentId },
    { new: true }
  );
  if (!updated) return; // already processed

  const user = await User.findById(updated.user);
  const now = new Date();
  if (updated.kind === 'order') {
    const order = await Order.findByIdAndUpdate(
      updated.order,
      { status: 'Submitted', paymentStatus: 'Paid', receiptNo: receiptNo(), paidAt: now },
      { new: true }
    );
    await notifyUser(
      user,
      `Payment received - ${order.serviceName}`,
      `Hi ${user.name}, we received Rs ${order.totalAmount} for ${order.serviceName}. Receipt ${order.receiptNo}. We'll update you as it progresses.`
    );
  } else {
    const job = await PrintJob.findByIdAndUpdate(
      updated.printJob,
      {
        status: 'Pending',
        paymentStatus: 'Paid',
        receiptNo: receiptNo(),
        paidAt: now,
        pickupCode: String(crypto.randomInt(1000, 9999)),
      },
      { new: true }
    );
    await notifyUser(
      user,
      'Print job received',
      `Hi ${user.name}, your print job (${job.fileName}) is in the queue. Pickup code: ${job.pickupCode}.`
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
  await Model.updateOne({ _id: id, paymentStatus: { $ne: 'Paid' } }, { paymentStatus: 'Failed' });
}
