import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorNote, Eyebrow, HeroArt, useCafe } from '../../components.jsx';
import { Icon } from '../../icons.jsx';
import { PasswordInput } from '../../PasswordInput.jsx';

// Accepts pasted numbers like "+91 98765 43210"
function cleanMobile(value) {
  let d = value.replace(/\D/g, '');
  if (d.length > 10 && (d.startsWith('91') || d.startsWith('0'))) d = d.replace(/^(91|0)/, '');
  return d.slice(0, 10);
}
const cleanUsername = (value) => value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);

/* ---------- Login / sign up with username + password (FR-1, FR-2, C5) ---------- */
export function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const cafe = useCafe();
  const [mode, setMode] = useState('login'); // login | register
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [reg, setReg] = useState({ name: '', username: '', mobile: '', email: '', password: '', consent: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError('');
  };

  const run = (fn) => async (e) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await fn();
      login(r.token, r.user);
      nav(r.user.mustChangePassword ? '/profile' : loc.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const submitLogin = run(() => api('/auth/login', { method: 'POST', body: creds }));
  const submitRegister = run(() => api('/auth/register', { method: 'POST', body: reg }));

  if (user) return <Navigate to={user.role === 'customer' ? '/' : '/admin/orders'} replace />;

  return (
    <div className="auth">
      <Link to="/admin/login" className="admin-key" aria-label="Staff login">
        <Icon name="shield" size={18} />
      </Link>
      <section className="auth-side">
        <AuthBrand light />
        <div className="stack">
          <Eyebrow plain>Your neighbourhood digital desk</Eyebrow>
          <h1>Everyday services. Made a little easier.</h1>
          <p>Send your documents, pay online and pick up printouts when they're ready. Aadhaar, PAN, passport help and more{cafe.cafeName ? ` at ${cafe.cafeName}` : ''}.</p>
        </div>
        <ul className="auth-points">
          {[
            ['upload', 'Upload documents from your phone'],
            ['shieldCheck', 'Documents are encrypted and deleted after your order'],
            ['bell', 'Get an SMS when your work is ready'],
          ].map(([i, t], k) => (
            <li key={i} className="rise" style={{ '--i': k + 2 }}>
              <span className="tile sm">
                <Icon name={i} size={18} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <div className="art auth-art">
          <HeroArt />
        </div>
      </section>

      <section className="auth-main">
        <div className="auth-card">
          <div className="card rise">
            {mode === 'login' && (
              <form onSubmit={submitLogin} className="stack fade">
                <div className="stack-sm">
                  <h2>Welcome back</h2>
                  <p className="muted">Log in with your username and password.</p>
                </div>
                <label>
                  Username
                  <input id="username" autoComplete="username" autoCapitalize="none" value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} required autoFocus />
                </label>
                <label>
                  Password
                  <PasswordInput id="password" autoComplete="current-password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} required />
                </label>
                <p className="muted small">
                  <Link to="/forgot-password">Forgot your password?</Link>
                </p>
                <ErrorNote error={error} />
                <button className="btn primary lg block" disabled={busy || !creds.username || !creds.password}>
                  {busy ? <span className="spinner" /> : null} {busy ? 'Logging in…' : 'Log in'}
                  {!busy && <Icon name="arrowRight" size={18} className="arrow" />}
                </button>
                <p className="muted small" style={{ textAlign: 'center' }}>
                  New here?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode('register')}>
                    Create an account
                  </button>
                </p>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={submitRegister} className="stack fade">
                <div className="stack-sm">
                  <h2>Create your account</h2>
                  <p className="muted">Pick a username and password. You'll use them every time you log in.</p>
                </div>
                <label>
                  Full name
                  <input id="name" autoComplete="name" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} required autoFocus />
                </label>
                <label>
                  <span>
                    Username <span className="hint">(4-20 letters, numbers, . or _)</span>
                  </span>
                  <input id="reg-username" autoComplete="username" autoCapitalize="none" value={reg.username} onChange={(e) => setReg({ ...reg, username: cleanUsername(e.target.value) })} required />
                </label>
                <label>
                  <span>
                    Mobile number <span className="hint">(for SMS updates on your orders)</span>
                  </span>
                  <input id="mobile" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit number" value={reg.mobile} onChange={(e) => setReg({ ...reg, mobile: cleanMobile(e.target.value) })} required />
                </label>
                <label>
                  <span>
                    Email <span className="hint">(for receipts, optional)</span>
                  </span>
                  <input id="email" type="email" autoComplete="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                </label>
                <label>
                  <span>
                    Password <span className="hint">(at least 4 characters)</span>
                  </span>
                  <PasswordInput id="reg-password" autoComplete="new-password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required />
                </label>
                <label className="check">
                  <input id="consent" type="checkbox" checked={reg.consent} onChange={(e) => setReg({ ...reg, consent: e.target.checked })} />
                  <span>
                    I agree to the{' '}
                    <Link to="/privacy" target="_blank">
                      privacy policy
                    </Link>
                    . My documents are used only for my orders and deleted afterwards.
                  </span>
                </label>
                <ErrorNote error={error} />
                <button className="btn primary lg block" disabled={busy || !reg.consent || reg.name.trim().length < 2 || reg.username.length < 4 || reg.mobile.length < 10 || reg.password.length < 4}>
                  {busy ? <span className="spinner" /> : null} {busy ? 'Creating account…' : 'Create account'}
                </button>
                <p className="muted small" style={{ textAlign: 'center' }}>
                  Already have an account?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode('login')}>
                    Log in
                  </button>
                </p>
              </form>
            )}
          </div>
          <p className="muted small" style={{ textAlign: 'center' }}>
            <Link to="/privacy">Privacy</Link> · <Link to="/refund-policy">Refunds</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function AuthBrand({ light }) {
  const cafe = useCafe();
  return (
    <span className="brand" style={light ? { color: '#fff' } : undefined}>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand-text">
        <span className="brand-name">{(cafe.cafeName || 'Cyber Cafe').toLowerCase()}</span>
        <span className="brand-sub">Cyber Café</span>
      </span>
    </span>
  );
}
