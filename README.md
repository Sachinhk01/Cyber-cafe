# Cyber Cafe Web Platform (v1)

Customer app + admin panel + API, built from the SRS v1.0.

- `backend/`  Node.js + Express + MongoDB (Mongoose)
- `frontend/` React + Vite

## 1. Requirements

- Node.js 18 or newer
- MongoDB running locally, or a free MongoDB Atlas cluster

## 2. Run the backend

```bash
cd backend
cp .env.example .env        # on Windows: copy .env.example .env
# open .env and set MONGO_URI and JWT_SECRET (any long random text)
npm install
npm run seed                # creates the owner login + 10 sample services + print rates
npm run dev                 # API on http://localhost:5000
```

## 3. Run the frontend

```bash
cd frontend
npm install
npm run dev                 # app on http://localhost:5173
```

Vite forwards `/api` to the backend, so no extra config is needed in development.

## 4. Try the full flow

**Customer**
1. Open http://localhost:5173 and create an account (name, mobile, email).
2. No SMS provider yet, so the OTP shows on the screen (and in the backend console).
3. Pick a service, upload the documents, fill details, review, then pay.
4. With no Razorpay keys the app opens a **test payment** box: choose "Pay successfully" or "Simulate failure". After a failure, open the order and pay again; documents are not re-uploaded.
5. Go to **Print**, upload a PDF, change copies / colour / paper and watch the price update, then pay. You get a 4-digit pickup code.
6. **Receipts** shows payment history; open one to print or save it as PDF.

**Admin** (http://localhost:5173/admin/login, owner email and password from `.env`)
1. **Orders**: filter by status, service and date, open an order, view the documents, change status, add a remark. The customer is notified (printed in the backend console until email/SMS is set up).
2. **Print queue**: Start printing → Mark ready → enter the customer's pickup code → Hand over.
3. **Services**: add, edit or hide services, their price, required documents and detail fields.
4. **Payments**, **Customers**, **Dashboard** (today/month revenue, 14-day chart, orders per service).
5. **Customers → Export to Excel** downloads the monthly customers + transactions report.
6. **Settings**: print rates per page, document retention days, and staff logins.

## Roles

| Role | Login | Can use |
|---|---|---|
| Customer | Mobile + OTP | Services, orders, print, receipts, profile |
| Staff | Email + password | Orders, print queue |
| Owner | Email + password | Everything, including revenue, payments, customers, reports, settings |

## Going live

- **Razorpay**: put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (test keys first) in `backend/.env`. In the Razorpay dashboard add a webhook to `https://YOUR-API/api/payments/webhook` with events `payment.captured` and `payment.failed`, and copy its secret into `RAZORPAY_WEBHOOK_SECRET`.
- **OTP / SMS**: add your provider call inside `sendSms()` in `backend/src/lib/notify.js` and set `SMS_PROVIDER`. Set `NODE_ENV=production` so OTPs stop showing on screen.
- **Email**: fill the `SMTP_*` values (Gmail app password or Google Workspace).
- **Files**: uploads are saved to `backend/uploads` (private, served only to the file owner and admins). For hosting, use a server with a persistent disk, or swap `lib/upload.js` to Cloudinary / S3.
- **Hosting**: frontend on Vercel (set `VITE_API_URL` to the API URL), backend on Render or Railway, database on MongoDB Atlas. Set `CLIENT_URL` in the backend to the frontend URL.

## Where things are

```
backend/src
  server.js          app setup, security, routes
  models.js          User, Service, Order, PrintJob, Payment, Document, Settings
  seed.js            owner account + sample services
  lib/auth.js        JWT + role checks
  lib/upload.js      file type/size validation (PDF, JPG, PNG)
  lib/payments.js    Razorpay, signature checks, mock mode
  lib/notify.js      email + SMS
  lib/cleanup.js     deletes documents after the retention period
  routes/            auth, services, orders, print, payments, files, admin
frontend/src
  main.jsx           routes
  api.js             API calls, uploads with progress, private file viewing
  auth.jsx           login state + protected routes
  components.jsx     layout, status badges, payment button
  pages/Customer.jsx customer screens
  pages/Admin.jsx    admin screens
```

## Not in v1 (from the SRS "later release" list)

Subscriptions, WhatsApp notifications, automatic refunds. For now, refund a rejected order from the Razorpay dashboard.
