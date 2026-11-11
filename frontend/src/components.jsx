import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api, rupees } from './api.js';
import { useAuth, isAdmin } from './auth.jsx';

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const admin = isAdmin(user);
  const links = admin
    ? [
        ...(user.role === 'owner' ? [['/admin', 'Dashboard']] : []),
        ['/admin/orders', 'Orders'],
        ['/admin/print', 'Print queue'],
        ...(user.role === 'owner'
          ? [
              ['/admin/services', 'Services'],
              ['/admin/payments', 'Payments'],
              ['/admin/customers', 'Customers'],
              ['/admin/settings', 'Settings'],
            ]
          : []),
      ]
    : user
      ? [
          ['/', 'Home'],
          ['/print', 'Print'],
          ['/receipts', 'Receipts'],
          ['/profile', 'Profile'],
        ]
      : [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={admin ? '/admin/orders' : '/'} className="brand">
            <span className="brand-mark">CC</span> Cyber Cafe {admin && <span className="tag">{user.role}</span>}
          </Link>
          {user && (
            <nav className="nav">
              {links.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/' || to === '/admin'}>
                  {label}
                </NavLink>
              ))}
              <button
                className="link-btn"
                onClick={() => {
                  logout();
                  nav(admin ? '/admin/login' : '/login');
                }}
              >
                Log out
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

const STATUS_TONE = {
  PendingPayment: 'warn',
  Pending: 'info',
  Submitted: 'info',
  'In Progress': 'info',
  Printing: 'info',
  Ready: 'good',
  Completed: 'good',
  Collected: 'muted',
  Success: 'good',
  Paid: 'good',
  Rejected: 'bad',
  Failed: 'bad',
};
const STATUS_LABEL = { PendingPayment: 'Awaiting payment' };

export function Status({ value }) {
  return <span className={`badge ${STATUS_TONE[value] || 'muted'}`}>{STATUS_LABEL[value] || value}</span>;
}

export function ErrorNote({ error }) {
  return error ? <p className="error" role="alert">{error}</p> : null;
}

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Razorpay. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

// FR-15/16/17: pay with Razorpay (or the mock popup when no keys are set). Retry = click again.
export function PayButton({ kind, id, amount, onDone, label }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mock, setMock] = useState(null);

  async function start() {
    setError('');
    setBusy(true);
    try {
      const p = await api('/payments/create', { method: 'POST', body: { kind, id } });
      if (p.free) return onDone?.();
      if (p.mock) return setMock(p);
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: p.keyId,
        order_id: p.razorpayOrderId,
        amount: p.amount * 100,
        currency: 'INR',
        name: 'Cyber Cafe',
        prefill: p.prefill,
        handler: async (resp) => {
          try {
            await api('/payments/verify', { method: 'POST', body: { paymentId: p.paymentId, ...resp } });
            onDone?.();
          } catch (e) {
            setError(e.message);
            onDone?.();
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: async () => {
            await api('/payments/failed', { method: 'POST', body: { paymentId: p.paymentId } }).catch(() => {});
            setError('Payment was not completed. You can try again.');
            setBusy(false);
            onDone?.();
          },
        },
      });
      rzp.open();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function finishMock(outcome) {
    try {
      await api('/payments/mock-confirm', { method: 'POST', body: { paymentId: mock.paymentId, outcome } });
      if (outcome !== 'success') setError('Test payment failed. You can try again.');
    } catch (e) {
      setError(e.message);
    }
    setMock(null);
    setBusy(false);
    onDone?.();
  }

  return (
    <div className="pay">
      <button className="btn primary" disabled={busy} onClick={start}>
        {busy ? 'Opening payment…' : label || `Pay ${rupees(amount)}`}
      </button>
      <ErrorNote error={error} />
      {mock && (
        <div className="modal-back">
          <div className="modal" role="dialog" aria-label="Test payment">
            <h3>Test payment</h3>
            <p className="muted">Razorpay keys are not set, so this is a simulated payment of {rupees(mock.amount)}.</p>
            <div className="row">
              <button className="btn primary" onClick={() => finishMock('success')}>
                Pay successfully
              </button>
              <button className="btn" onClick={() => finishMock('fail')}>
                Simulate failure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
