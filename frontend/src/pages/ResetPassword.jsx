import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorNote, SuccessNote } from '../components.jsx';
import { PasswordInput } from '../PasswordInput.jsx';

// Shared frame for the two screens (same look as the login page)
function AuthFrame({ children }) {
  return (
    <div className="auth">
      <section className="auth-main" style={{ gridColumn: '1 / -1' }}>
        <div className="auth-card">
          <div className="card stack rise">{children}</div>
          <p className="muted small" style={{ textAlign: 'center' }}>
            <Link to="/login">Customer login</Link> · <Link to="/admin/login">Staff login</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

/* ---------- Step 1: ask for a reset link ---------- */
export function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/forgot-password', { method: 'POST', body: { identifier } });
      setDone(r.message);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <AuthFrame>
      <div className="stack-sm">
        <h2>Forgot your password?</h2>
        <p className="muted">Enter your username or email. We'll email you a link to set a new password.</p>
      </div>
      {done ? (
        <>
          <SuccessNote>{done}</SuccessNote>
          <Link to="/login" className="btn primary lg block">
            Back to login
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <label>
            Username or email
            <input id="identifier" autoComplete="username" autoCapitalize="none" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
          </label>
          <ErrorNote error={error} />
          <button className="btn primary lg block" disabled={busy || identifier.trim().length < 3}>
            {busy && <span className="spinner" />} {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}

/* ---------- Step 2: set a new password from the emailed link ---------- */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneRole, setDoneRole] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      const r = await api('/auth/reset-password', { method: 'POST', body: { token, password: form.password } });
      setDoneRole(r.role);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (!token) {
    return (
      <AuthFrame>
        <h2>Reset link missing</h2>
        <p className="muted">Open the link from your email again, or ask for a new one.</p>
        <Link to="/forgot-password" className="btn primary lg block">
          Get a new link
        </Link>
      </AuthFrame>
    );
  }

  if (doneRole) {
    const admin = doneRole !== 'customer';
    return (
      <AuthFrame>
        <SuccessNote>Your password has been changed. You have been logged out on all devices.</SuccessNote>
        <Link to={admin ? '/admin/login' : '/login'} className="btn primary lg block">
          Log in with the new password
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="stack-sm">
        <h2>Choose a new password</h2>
        <p className="muted">Customers: at least 4 characters. Owner and staff: at least 10 characters with letters and numbers.</p>
      </div>
      <form onSubmit={submit} className="stack">
        <label>
          New password
          <PasswordInput id="new-password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoFocus />
        </label>
        <label>
          Type it again
          <PasswordInput id="confirm-password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
        </label>
        <ErrorNote error={error} />
        <button className="btn primary lg block" disabled={busy || !form.password || !form.confirm}>
          {busy && <span className="spinner" />} {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Link expired? <Link to="/forgot-password">Get a new one</Link>
      </p>
    </AuthFrame>
  );
}
