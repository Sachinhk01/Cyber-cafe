import { Router } from 'express';
import express from 'express';
import { Order, PrintJob, Payment, User } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';
import {
  mockMode,
  createGatewayOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  markPaymentSuccess,
  markPaymentFailed,
} from '../lib/payments.js';

const r = Router();

// Razorpay webhook needs the raw body for signature check; mounted before express.json in server.js
export const webhookHandler = [
  express.raw({ type: 'application/json' }),
  ah(async (req, res) => {
    if (!verifyWebhookSignature(req.body, req.headers['x-razorpay-signature'])) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    const event = JSON.parse(req.body.toString());
    const entity = event.payload?.payment?.entity;
    if (entity?.order_id) {
      const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
      if (payment) {
        if (event.event === 'payment.captured' || event.event === 'order.paid') {
          await markPaymentSuccess(payment, entity.id);
        } else if (event.event === 'payment.failed') {
          await markPaymentFailed(payment);
        }
      }
    }
    res.json({ ok: true });
  }),
];

r.get('/config', (req, res) => {
  res.json({ mock: mockMode, keyId: mockMode ? null : process.env.RAZORPAY_KEY_ID });
});

r.use(auth(['customer']));

// FR-14/15/17: start a payment (also used for retries; documents stay as they are)
r.post(
  '/create',
  ah(async (req, res) => {
    const { kind, id } = req.body;
    if (!['order', 'print'].includes(kind)) throw new HttpError(400, 'Unknown payment type.');
    const Model = kind === 'order' ? Order : PrintJob;
    const target = await Model.findOne({ _id: id, user: req.user.id }).catch(() => null);
    if (!target) throw new HttpError(404, 'Nothing to pay for.');
    if (target.paymentStatus === 'Paid') throw new HttpError(400, 'This is already paid.');

    const amount = kind === 'order' ? target.totalAmount : target.price;

    // Free services skip the gateway
    if (amount <= 0) {
      const free = await Payment.create({
        user: req.user.id,
        kind,
        [kind === 'order' ? 'order' : 'printJob']: target._id,
        amount: 0,
        razorpayOrderId: 'free_' + target._id,
      });
      await markPaymentSuccess(free, 'free');
      return res.json({ paymentId: free._id, free: true });
    }

    const gw = await createGatewayOrder(amount, String(target._id));
    const payment = await Payment.create({
      user: req.user.id,
      kind,
      [kind === 'order' ? 'order' : 'printJob']: target._id,
      amount,
      razorpayOrderId: gw.id,
      mock: mockMode,
    });
    const user = await User.findById(req.user.id);
    res.json({
      paymentId: payment._id,
      razorpayOrderId: gw.id,
      amount,
      mock: mockMode,
      keyId: mockMode ? null : process.env.RAZORPAY_KEY_ID,
      prefill: { name: user.name, email: user.email, contact: user.mobile },
    });
  })
);

// FR-16: verify on the server after Razorpay checkout
r.post(
  '/verify',
  ah(async (req, res) => {
    const { paymentId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const payment = await Payment.findOne({ _id: paymentId, user: req.user.id }).catch(() => null);
    if (!payment || payment.razorpayOrderId !== razorpay_order_id) throw new HttpError(404, 'Payment not found.');
    if (mockMode || !verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      await markPaymentFailed(payment);
      throw new HttpError(400, 'Payment could not be verified. You can try again.');
    }
    await markPaymentSuccess(payment, razorpay_payment_id);
    res.json(await Payment.findById(payment._id));
  })
);

// Mock mode only: simulate success or failure
r.post(
  '/mock-confirm',
  ah(async (req, res) => {
    if (!mockMode) throw new HttpError(403, 'Mock payments are off.');
    const payment = await Payment.findOne({ _id: req.body.paymentId, user: req.user.id }).catch(() => null);
    if (!payment) throw new HttpError(404, 'Payment not found.');
    if (req.body.outcome === 'success') await markPaymentSuccess(payment, 'mock_pay_' + Date.now());
    else await markPaymentFailed(payment);
    res.json(await Payment.findById(payment._id));
  })
);

// Customer closed checkout or it failed in the browser
r.post(
  '/failed',
  ah(async (req, res) => {
    const payment = await Payment.findOne({ _id: req.body.paymentId, user: req.user.id }).catch(() => null);
    if (payment) await markPaymentFailed(payment);
    res.json({ ok: true });
  })
);

// FR-8: payment history and receipts
r.get(
  '/mine',
  ah(async (req, res) => {
    res.json(
      await Payment.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .populate('order', 'serviceName receiptNo')
        .populate('printJob', 'fileName receiptNo')
    );
  })
);

// FR-18: receipt
r.get(
  '/:id/receipt',
  ah(async (req, res) => {
    const payment = await Payment.findOne({ _id: req.params.id, user: req.user.id, status: 'Success' })
      .populate('order')
      .populate('printJob')
      .populate('user', 'name mobile email')
      .catch(() => null);
    if (!payment) throw new HttpError(404, 'Receipt not found.');
    res.json(payment);
  })
);

export default r;
