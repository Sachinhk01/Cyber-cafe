// End-to-end API test: walks through every main flow and loophole fix.
//
//   1. Start the API in development mode (npm run dev) with NO Razorpay keys and NO SMS provider,
//      so test payments and on-screen OTPs are on.
//   2. In a second terminal:  npm run smoke -- --yes
//
// Use a TEST database (a separate MONGO_URI): it creates customers, orders and a temporary staff login.
// Env: API_URL (default http://localhost:5000), OWNER_EMAIL / OWNER_PASSWORD (default: ADMIN_EMAIL / ADMIN_PASSWORD from .env)
import 'dotenv/config';
import { PDFDocument } from 'pdf-lib';

if (!process.argv.includes('--yes')) {
  console.log('This test writes test data (customers, orders, a temporary staff login) to the database the API uses.');
  console.log('Point the API at a test database, then run: npm run smoke -- --yes');
  process.exit(1);
}

const BASE = (process.env.API_URL || 'http://localhost:5000') + '/api';
const OWNER_EMAIL = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'owner@cybercafe.local';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || process.env.ADMIN_PASSWORD || 'ChangeMe@123';

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m ${extra}`);
  }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function call(path, { method = 'GET', token, body, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  const data = raw ? Buffer.from(await res.arrayBuffer()) : type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}

const rnd = () => String(6 + Math.floor(Math.random() * 4)) + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');

async function makePdf(pages) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([595, 842]).drawText(`Smoke test page ${i + 1}`, { x: 50, y: 780 });
  return Buffer.from(await pdf.save());
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const blob = (buf, type) => new Blob([buf], { type });

async function customer(label) {
  const mobile = rnd();
  const s = await call('/auth/send-otp', { method: 'POST', body: { mobile } });
  if (!s.data.devOtp) throw new Error('No devOtp returned. Run the API with NODE_ENV=development and no SMS_PROVIDER.');
  const v = await call('/auth/verify-otp', { method: 'POST', body: { mobile, otp: s.data.devOtp } });
  const c = await call('/auth/complete-signup', { method: 'POST', body: { signupToken: v.data.signupToken, name: label, email: '', consent: true } });
  return { mobile, token: c.data.token, user: c.data.user };
}

async function pay(token, kind, id) {
  const p = await call('/payments/create', { method: 'POST', token, body: { kind, id } });
  if (p.data.free) return p;
  return call('/payments/mock-confirm', { method: 'POST', token, body: { paymentId: p.data.paymentId, outcome: 'success' } });
}

async function main() {
  section('Health');
  const h = await call('/health');
  check('API is up and the database is connected', h.status === 200 && h.data.db === true, JSON.stringify(h.data));
  const cfg = await call('/payments/config');
  if (!cfg.data.mock) throw new Error('Razorpay keys are set. Run this test without RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (test payments).');

  section('Login with OTP (D3, D4, C5)');
  const mobile = rnd();
  let r = await call('/auth/send-otp', { method: 'POST', body: { mobile: '12345' } });
  check('Rejects an invalid mobile number', r.status === 400);
  r = await call('/auth/send-otp', { method: 'POST', body: { mobile } });
  check('Unknown number gets a code (no "no account" message)', r.status === 200 && !!r.data.devOtp);
  const otp = r.data.devOtp;
  r = await call('/auth/send-otp', { method: 'POST', body: { mobile } });
  check('Second code within 30 s is refused (per number)', r.status === 429);
  r = await call('/auth/verify-otp', { method: 'POST', body: { mobile, otp: otp === '111111' ? '222222' : '111111' } });
  check('Wrong code is refused', r.status === 400);
  r = await call('/auth/verify-otp', { method: 'POST', body: { mobile, otp } });
  check('New number: no account yet, asks for profile', r.status === 200 && r.data.needsProfile && !r.data.token);
  const signupToken = r.data.signupToken;
  r = await call('/auth/verify-otp', { method: 'POST', body: { mobile, otp } });
  check('The same code cannot be used twice', r.status === 400);
  r = await call('/auth/complete-signup', { method: 'POST', body: { signupToken, name: 'Smoke Customer', consent: false } });
  check('Account needs privacy consent', r.status === 400);
  r = await call('/auth/complete-signup', { method: 'POST', body: { signupToken, name: 'Smoke Customer', email: 'smoke@example.com', consent: true } });
  check('Account created after OTP + consent', r.status === 200 && !!r.data.token);
  const c1 = { token: r.data.token, user: r.data.user };
  r = await call('/auth/me', { token: c1.token });
  check('Profile loads', r.status === 200 && r.data.name === 'Smoke Customer');

  section('Services with procedure (A2)');
  r = await call('/services');
  check('Services list is not empty', r.status === 200 && r.data.length > 0, `got ${r.data.length}`);
  const withDocs = r.data.find((s) => s.requiredDocs.length >= 1 && s.price > 0);
  const free = r.data.find((s) => s.price === 0 && s.requiredDocs.length === 0);
  check('Services carry steps, processing time and category', !!withDocs && Array.isArray(withDocs.steps) && 'processingTime' in withDocs && !!withDocs.category);
  r = await call(`/services/${withDocs._id}`);
  check('Service detail page data loads', r.status === 200 && r.data.name === withDocs.name);
  r = await call('/services/not-an-id');
  check('Unknown service id gives 404 (not a crash)', r.status === 404);

  section('Ordering, uploads and file safety (FR-10..13, C3, F1)');
  const pdf1 = await makePdf(1);
  const orderForm = (agree = true, fileFor = () => blob(pdf1, 'application/pdf')) => {
    const f = new FormData();
    f.append('serviceId', withDocs._id);
    f.append('details', JSON.stringify(Object.fromEntries(withDocs.detailFields.map((k) => [k, '9876543210']))));
    if (agree) f.append('agreeTerms', 'true');
    withDocs.requiredDocs.forEach((d, i) => f.append(`doc_${i}`, fileFor(i), `doc${i}.pdf`));
    return f;
  };
  r = await call('/orders', { method: 'POST', token: c1.token, form: orderForm(false) });
  check('Order needs "I agree to the terms"', r.status === 400 && /agree/i.test(r.data.error));
  r = await call('/orders', { method: 'POST', token: c1.token, form: orderForm(true, () => blob(Buffer.from('MZ fake exe'), 'application/pdf')) });
  check('A fake PDF (wrong content) is refused', r.status === 400);
  const wf = orderForm();
  wf.set('doc_0', blob(Buffer.from('word'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'resume.docx');
  r = await call('/orders', { method: 'POST', token: c1.token, form: wf });
  check('A Word file gets a clear "save as PDF" message', r.status === 400 && /PDF/i.test(r.data.error) && /Word/i.test(r.data.error));
  r = await call('/orders', { method: 'POST', token: c1.token, form: orderForm() });
  check('Order created with documents', r.status === 201 && r.data.status === 'PendingPayment');
  check('Order has a readable number (CC-xxxx)', /^CC-\d+$/.test(r.data.orderNo || ''), r.data.orderNo);
  const order1 = r.data;
  r = await call(`/orders/${order1._id}`, { token: c1.token });
  check('Order page shows the uploaded documents', r.status === 200 && r.data.documents.length === withDocs.requiredDocs.length);
  check('Document records never expose the file path', r.data.documents.every((d) => !('fileUrl' in d)));
  check('Order page carries the service steps', Array.isArray(r.data.service?.steps));
  const doc1 = r.data.documents[0];

  section('Customer can open and save their own files ("save back the PDF")');
  r = await call(`/files/${doc1._id}`, { token: c1.token, raw: true });
  check('View returns the original file (decrypted)', r.status === 200 && r.data.equals(pdf1));
  check('View opens inline', /inline/.test(r.headers.get('content-disposition') || ''));
  r = await call(`/files/${doc1._id}?download=1`, { token: c1.token, raw: true });
  check('Download saves the file (attachment)', r.status === 200 && /attachment/.test(r.headers.get('content-disposition') || '') && r.data.equals(pdf1));
  check('Files are sent with nosniff + sandbox headers (C4)', r.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(r.headers.get('content-security-policy') || ''));
  const c2 = await customer('Other Customer');
  r = await call(`/files/${doc1._id}`, { token: c2.token });
  check("Another customer can't open the file", r.status === 403);
  r = await call(`/orders/${order1._id}`, { token: c2.token });
  check("Another customer can't see the order", r.status === 404);

  section('Payment (FR-14..18)');
  r = await pay(c1.token, 'order', order1._id);
  check('Test payment succeeds', r.status === 200 && r.data.status === 'Success');
  r = await call(`/orders/${order1._id}`, { token: c1.token });
  check('Paid order moves to Submitted', r.data.order.status === 'Submitted' && r.data.order.paymentStatus === 'Paid');
  check('Timeline records the payment (E2)', r.data.order.history.length >= 2);
  const paymentId = r.data.payments.find((p) => p.status === 'Success')?._id;
  r = await call(`/payments/${paymentId}/invoice.pdf`, { token: c1.token, raw: true });
  check('PDF receipt downloads', r.status === 200 && r.data.subarray(0, 4).toString() === '%PDF');
  r = await call('/payments/create', { method: 'POST', token: c1.token, body: { kind: 'order', id: order1._id } });
  check('Paying an already-paid order is refused', r.status === 400);
  r = await call(`/orders/${order1._id}`, { method: 'DELETE', token: c1.token });
  check('A paid order cannot be deleted by the customer', r.status === 400);

  section('Printing (FR-19..22, F2)');
  const pdf2 = await makePdf(3);
  let pf = new FormData();
  pf.append('file', blob(pdf2, 'application/pdf'), 'notes.pdf');
  r = await call('/print', { method: 'POST', token: c1.token, form: pf });
  check('Print file uploaded, pages counted before paying', r.status === 201 && r.data.pages === 3, JSON.stringify(r.data).slice(0, 120));
  check('Upload returns the file id for preview', !!r.data.documentId);
  const job = r.data;
  r = await call('/print', { token: c1.token });
  const listed = r.data.find((j) => j._id === job._id);
  check('My print jobs list includes the file id', !!listed?.documentId);
  r = await call(`/files/${listed.documentId}?download=1`, { token: c1.token, raw: true });
  check('Customer can download the PDF they uploaded for printing', r.status === 200 && r.data.equals(pdf2));
  r = await call(`/print/${job._id}`, { method: 'PATCH', token: c1.token, body: { copies: 2, colorMode: 'color', paperSize: 'A4' } });
  const pub = (await call('/public-settings')).data;
  check('Price = rate × pages × copies', r.data.price === pub.printRates.color.A4 * 3 * 2, `price ${r.data.price}`);
  r = await pay(c1.token, 'print', job._id);
  r = await call('/print', { token: c1.token });
  const paidJob = r.data.find((j) => j._id === job._id);
  check('Paid print job gets a 4-digit pickup code', /^\d{4}$/.test(paidJob.pickupCode || ''));
  pf = new FormData();
  pf.append('file', blob(PNG, 'image/png'), 'photo.png');
  r = await call('/print', { method: 'POST', token: c1.token, form: pf });
  check('Images are accepted for printing (1 page)', r.status === 201 && r.data.pages === 1);
  r = await call(`/print/${r.data._id}`, { method: 'DELETE', token: c1.token });
  check('An unpaid print job can be removed', r.status === 200);

  section('Admin login (D5, D6)');
  r = await call('/auth/admin/login', { method: 'POST', body: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
  check('Owner logs in', r.status === 200 && r.data.user.role === 'owner', `status ${r.status}: ${r.data.error || ''} (set OWNER_EMAIL / OWNER_PASSWORD)`);
  if (r.status !== 200) throw new Error('Owner login failed; cannot test the admin panel.');
  const owner = r.data.token;
  if (OWNER_PASSWORD === 'ChangeMe@123') check('Default password is flagged for change', r.data.user.mustChangePassword === true);

  section('Admin: orders, files, tracking (A1, E1, E2, E3, D8)');
  r = await call('/admin/orders', { token: owner });
  check('Paid order shows in the admin list', r.data.some((o) => o._id === order1._id));
  r = await call(`/admin/orders?q=${encodeURIComponent(order1.orderNo)}`, { token: owner });
  check('Search by order number works', r.data.length >= 1 && r.data[0]._id === order1._id);
  r = await call(`/admin/orders/${order1._id}`, { token: owner });
  check('Admin order page lists the next allowed statuses', JSON.stringify(r.data.nextStatuses) === JSON.stringify(['In Progress', 'Rejected']));
  r = await call(`/files/${doc1._id}?download=1`, { token: owner, raw: true });
  check('Admin can DOWNLOAD the customer document (A1)', r.status === 200 && /attachment/.test(r.headers.get('content-disposition') || '') && r.data.equals(pdf1));
  r = await call(`/files/${listed.documentId}?download=1`, { token: owner, raw: true });
  check('Admin can download the print file (F3)', r.status === 200 && r.data.equals(pdf2));
  r = await call(`/admin/orders/${order1._id}`, { method: 'PATCH', token: owner, body: { status: 'Completed' } });
  check('Submitted -> Completed directly is refused (E3)', r.status === 400);
  const exp = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  r = await call(`/admin/orders/${order1._id}`, { method: 'PATCH', token: owner, body: { status: 'In Progress', referenceNo: 'URN-12345', expectedBy: exp, remark: 'Submitted on the portal' } });
  check('Move to In Progress with reference no. and expected date', r.status === 200 && r.data.order.status === 'In Progress' && r.data.order.referenceNo === 'URN-12345' && !!r.data.order.expectedBy);
  check('History records who changed it', r.data.order.history.at(-1).by && r.data.order.history.at(-1).status === 'In Progress');
  const resultPdf = await makePdf(1);
  const rf = new FormData();
  rf.append('files', blob(resultPdf, 'application/pdf'), 'acknowledgement.pdf');
  rf.append('label', 'Acknowledgement slip');
  r = await call(`/admin/orders/${order1._id}/results`, { method: 'POST', token: owner, form: rf });
  check('Admin sends a finished file to the customer (E1)', r.status === 201 && r.data.documents.some((d) => d.kind === 'result'));
  r = await call(`/orders/${order1._id}`, { token: c1.token });
  const result = r.data.documents.find((d) => d.kind === 'result');
  check('Customer sees the finished file', !!result && result.label === 'Acknowledgement slip');
  r = await call(`/files/${result._id}?download=1`, { token: c1.token, raw: true });
  check('Customer downloads the finished file', r.status === 200 && r.data.equals(resultPdf));
  r = await call(`/admin/orders/${order1._id}`, { method: 'PATCH', token: owner, body: { status: 'Completed' } });
  check('In Progress -> Completed', r.status === 200 && r.data.order.status === 'Completed');
  r = await call('/admin/audit', { token: owner });
  check('Activity log recorded document downloads and status changes (D8)', r.data.some((a) => a.action === 'document.downloaded') && r.data.some((a) => a.action === 'order.status'));

  section('Cancellation and refunds (B3)');
  r = await call('/orders', { method: 'POST', token: c1.token, form: orderForm() });
  const order2 = r.data;
  await pay(c1.token, 'order', order2._id);
  r = await call(`/orders/${order2._id}/cancel-request`, { method: 'POST', token: c1.token, body: { reason: 'Changed my mind' } });
  check('Customer requests cancellation of a paid order', r.status === 200 && r.data.cancelRequest.status === 'Requested');
  r = await call('/admin/stats', { token: owner });
  check('Dashboard counts the cancellation request', r.data.cancelRequests >= 1);
  r = await call(`/admin/orders/${order2._id}/cancel-decision`, { method: 'POST', token: owner, body: { approve: true } });
  check('Owner approves: order rejected and refunded', r.status === 200 && r.data.order.status === 'Rejected' && r.data.order.paymentStatus === 'Refunded');
  r = await call(`/admin/orders/${order2._id}`, { method: 'PATCH', token: owner, body: { status: 'In Progress' } });
  check('A rejected order is final', r.status === 400);
  r = await call('/orders', { method: 'POST', token: c1.token, form: orderForm() });
  const order3 = r.data;
  await pay(c1.token, 'order', order3._id);
  r = await call(`/admin/orders/${order3._id}`, { method: 'PATCH', token: owner, body: { status: 'Rejected', remark: 'Document unclear', refund: true } });
  check('"Reject and refund" in one step', r.status === 200 && r.data.order.paymentStatus === 'Refunded' && r.data.payments.some((p) => p.refund?.status === 'Processed'));

  section('Abuse limits (B4, D2)');
  if (free) {
    const ff = () => {
      const f = new FormData();
      f.append('serviceId', free._id);
      f.append('details', JSON.stringify(Object.fromEntries(free.detailFields.map((k) => [k, '2']))));
      f.append('agreeTerms', 'true');
      return f;
    };
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const o = await call('/orders', { method: 'POST', token: c2.token, form: ff() });
      statuses.push(o.status);
      if (o.status === 201) await pay(c2.token, 'order', o.data._id);
    }
    check('Only 2 open free requests per customer', statuses[0] === 201 && statuses[1] === 201 && statuses[2] === 429, statuses.join(','));
  }

  section('Print queue (FR-21, F3)');
  r = await call('/admin/print-jobs', { token: owner });
  const qjob = r.data.find((j) => j._id === job._id);
  check('Paid job is in the queue with its file id', !!qjob?.documentId);
  r = await call(`/admin/print-jobs/${job._id}`, { method: 'PATCH', token: owner, body: { status: 'Ready' } });
  check('Waiting -> Ready directly is refused', r.status === 400);
  await call(`/admin/print-jobs/${job._id}`, { method: 'PATCH', token: owner, body: { status: 'Printing' } });
  await call(`/admin/print-jobs/${job._id}`, { method: 'PATCH', token: owner, body: { status: 'Ready' } });
  r = await call(`/admin/print-jobs/${job._id}`, { method: 'PATCH', token: owner, body: { status: 'Collected', pickupCode: '0000' === paidJob.pickupCode ? '1111' : '0000' } });
  check('Wrong pickup code is refused', r.status === 400);
  r = await call(`/admin/print-jobs/${job._id}`, { method: 'PATCH', token: owner, body: { status: 'Collected', pickupCode: paidJob.pickupCode } });
  check('Right pickup code hands it over', r.status === 200 && r.data.status === 'Collected');

  section('Services admin (FR-25, A2)');
  r = await call('/services', { method: 'POST', token: owner, body: { name: 'Smoke Test Service', price: 10, category: 'Other', detailFields: 'D.O.B' } });
  check('Detail field with a dot is refused', r.status === 400);
  r = await call('/services', {
    method: 'POST',
    token: owner,
    body: { name: 'Smoke Test Service', price: 10, category: 'Applications', steps: '1. Upload\n2. We check\n- We submit', included: 'Form filling', notIncluded: 'Govt fee', processingTime: '1 day', processingDays: 1, terms: 'Test terms', isActive: false },
  });
  check('Service with steps / included / not included saved', r.status === 201 && r.data.steps.length === 3 && r.data.steps[0] === 'Upload' && r.data.notIncluded[0] === 'Govt fee');
  const tempService = r.data;
  r = await call(`/services/${tempService._id}`, { method: 'DELETE', token: owner });
  check('Never-ordered service is deleted', r.status === 200 && r.data.deleted);

  section('Staff, passwords and lockout (D5, D6, D7)');
  const staffEmail = `smoke-staff-${Date.now()}@example.com`;
  r = await call('/admin/staff', { method: 'POST', token: owner, body: { name: 'Smoke Staff', email: staffEmail, password: 'short' } });
  check('Weak staff password is refused', r.status === 400);
  r = await call('/admin/staff', { method: 'POST', token: owner, body: { name: 'Smoke Staff', email: staffEmail, password: 'Counter2026desk' } });
  check('Staff login created', r.status === 201);
  const staffId = r.data.id;
  r = await call('/auth/admin/login', { method: 'POST', body: { email: staffEmail, password: 'Counter2026desk' } });
  let staff = r.data.token;
  check('Staff logs in and is asked to change the password', r.status === 200 && r.data.user.mustChangePassword === true);
  r = await call('/admin/stats', { token: staff });
  check("Staff can't see revenue", r.status === 403);
  r = await call('/auth/change-password', { method: 'POST', token: staff, body: { current: 'Counter2026desk', next: 'Front2Desk2026x' } });
  check('Staff changes password', r.status === 200 && r.data.user.mustChangePassword === false);
  const oldStaffToken = staff;
  staff = r.data.token;
  r = await call('/admin/orders', { token: oldStaffToken });
  check('Old session is signed out after a password change', r.status === 401);
  for (let i = 0; i < 5; i++) await call('/auth/admin/login', { method: 'POST', body: { email: staffEmail, password: 'wrong-password-1' } });
  r = await call('/auth/admin/login', { method: 'POST', body: { email: staffEmail, password: 'Front2Desk2026x' } });
  check('5 wrong passwords lock the login', r.status === 429);
  r = await call(`/admin/staff/${staffId}`, { method: 'DELETE', token: owner });
  r = await call('/admin/orders', { token: staff });
  check('Removed staff are locked out immediately', r.status === 401);

  section('Reports, settings, backup');
  r = await call('/admin/stats', { token: owner });
  check('Dashboard numbers load', r.status === 200 && typeof r.data.monthRevenue === 'number');
  r = await call('/admin/customers', { token: owner });
  check('Customers list loads', r.status === 200 && r.data.customers.length >= 2);
  const month = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
  r = await call(`/admin/reports/export?month=${month}`, { token: owner, raw: true });
  check('Excel report downloads', r.status === 200 && r.data.length > 0);
  r = await call('/admin/settings', { method: 'PUT', token: owner, body: { openTime: '21:00', closeTime: '09:00' } });
  check('Invalid opening hours are refused', r.status === 400);
  r = await call('/admin/backup/download', { token: owner, raw: true });
  check('Encrypted backup downloads (C2)', r.status === 200 && r.data.subarray(0, 4).toString() === 'CCE1');
  r = await call('/admin/notifications?status=all', { token: owner });
  check('Message log records SMS/email attempts (E4)', r.status === 200 && r.data.length > 0);

  section('Customer privacy (C5, D7)');
  r = await call('/auth/my-data', { token: c1.token });
  check('Customer downloads their data', r.status === 200 && r.data.orders.length >= 1);
  if (free) {
    r = await call('/auth/me', { method: 'DELETE', token: c2.token });
    check('Account with work in progress cannot be deleted yet', r.status === 400);
  }
  r = await call('/auth/logout-all', { method: 'POST', token: c2.token });
  r = await call('/auth/me', { token: c2.token });
  check('"Log out everywhere" ends the session', r.status === 401);
  const c3 = await customer('Delete Me');
  r = await call('/auth/me', { method: 'DELETE', token: c3.token });
  check('Customer deletes their account', r.status === 200);
  r = await call('/auth/me', { token: c3.token });
  check('Deleted account is signed out', r.status === 401);

  section('Payment safety (B1, B2)');
  r = await call('/payments/webhook', { method: 'POST', body: { event: 'payment.captured' } });
  check('Webhook without a valid signature is refused', r.status === 400);
}

main()
  .catch((e) => {
    failed++;
    fails.push(e.message);
    console.error('\n\x1b[31mStopped:\x1b[0m', e.message);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) console.log('Failed:\n - ' + fails.join('\n - '));
    process.exit(failed ? 1 : 0);
  });
