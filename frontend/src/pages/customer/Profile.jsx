import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, downloadFile } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorNote, SuccessNote, useCafe, Modal, fmtTime, dayRange, initials } from '../../components.jsx';
import { Icon } from '../../icons.jsx';
import { PasswordInput } from '../../PasswordInput.jsx';

export function Profile() {
  const { user, updateUser, login, logout } = useAuth();
  const nav = useNavigate();
  const cafe = useCafe();
  const [form, setForm] = useState({ name: user.name, email: user.email || '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [delErr, setDelErr] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    setBusy(true);
    try {
      updateUser(await api('/auth/me', { method: 'PUT', body: form }));
      setMsg('Profile saved.');
    } catch (e2) {
      setError(e2.message);
    }
    setBusy(false);
  }
  async function changePassword(e) {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (pw.next !== pw.confirm) return setPwErr('The new passwords do not match.');
    setPwBusy(true);
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { current: pw.current, next: pw.next } });
      login(r.token, r.user);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg('Password changed. Your other devices were signed out.');
    } catch (e2) {
      setPwErr(e2.message);
    }
    setPwBusy(false);
  }
  async function logoutAll() {
    await api('/auth/logout-all', { method: 'POST' }).catch(() => {});
    logout();
    nav('/login');
  }
  async function deleteAccount() {
    setDelErr('');
    try {
      await api('/auth/me', { method: 'DELETE' });
      logout();
      nav('/login');
    } catch (e) {
      setDelErr(e.message);
    }
  }

  return (
    <div className="stack-lg narrow">
      {user.mustChangePassword && (
        <div className="note bad">
          <Icon name="key" size={18} />
          <span><strong>Choose your own password.</strong> You are using a temporary password from the cafe. Set a new one below.</span>
        </div>
      )}
      <div className="row" style={{ gap: 18 }}>
        <span className="avatar lg">{initials(user.name)}</span>
        <div>
          <h1>{user.name}</h1>
          <p className="muted">+91 {user.mobile}</p>
        </div>
      </div>
      <form className="card pad-lg stack" onSubmit={save}>
        <h3>Your details</h3>
        <div className="form-grid">
          <label>
            Full name
            <input id="pname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <span>
              Email <span className="hint">(receipts are sent here)</span>
            </span>
            <input id="pemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="full">
            <span>
              Mobile number <span className="hint">(used to log in, can't be changed)</span>
            </span>
            <input id="pmobile" value={user.mobile || ''} disabled />
          </label>
        </div>
        <ErrorNote error={error} />
        <SuccessNote>{msg}</SuccessNote>
        <div>
          <button className="btn primary" disabled={busy}>
            {busy && <span className="spinner" />} Save changes
          </button>
        </div>
      </form>

      <form className="card pad-lg stack" onSubmit={changePassword} id="password">
        <h3>Change password</h3>
        <div className="form-grid">
          <label className="full">
            Current password
            <PasswordInput id="pw-current" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </label>
          <label>
            <span>New password <span className="hint">(at least 4 characters)</span></span>
            <PasswordInput id="pw-next" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </label>
          <label>
            Confirm new password
            <PasswordInput id="pw-confirm" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
          </label>
        </div>
        <ErrorNote error={pwErr} />
        <SuccessNote>{pwMsg}</SuccessNote>
        <div>
          <button className="btn primary" disabled={pwBusy || !pw.current || pw.next.length < 4}>
            {pwBusy && <span className="spinner" />} Change password
          </button>
        </div>
      </form>

      <div className="card pad-lg stack" id="help">
        <h3>Contact the cafe</h3>
        <div className="stack-sm small">
          {cafe.cafePhone && (
            <a className="row" style={{ gap: 8 }} href={`tel:${cafe.cafePhone}`}>
              <Icon name="phone" size={16} /> {cafe.cafePhone}
            </a>
          )}
          {cafe.cafeAddress && (
            <span className="row muted" style={{ gap: 8 }}>
              <Icon name="pin" size={16} /> {cafe.cafeAddress}
            </span>
          )}
          <span className="row muted" style={{ gap: 8 }}>
            <Icon name="clock" size={16} /> {dayRange(cafe.openDays || [])}, {fmtTime(cafe.openTime || '09:00')} – {fmtTime(cafe.closeTime || '20:00')}
          </span>
        </div>
      </div>

      <div className="card pad-lg stack">
        <h3>Privacy and security</h3>
        <div className="row between wrap">
          <div>
            <strong className="small">Download my data</strong>
            <p className="muted small">A copy of your account, orders and payments.</p>
          </div>
          <button className="btn" onClick={() => downloadFile('/auth/my-data', 'my-data.json').catch((e) => setError(e.message))}>
            <Icon name="download" size={16} /> Download
          </button>
        </div>
        <hr className="divider" />
        <div className="row between wrap">
          <div>
            <strong className="small">Log out on all devices</strong>
            <p className="muted small">Use this if you logged in on a shared computer.</p>
          </div>
          <button className="btn" onClick={logoutAll}>
            <Icon name="logout" size={16} /> Log out everywhere
          </button>
        </div>
        <hr className="divider" />
        <div className="row between wrap">
          <div>
            <strong className="small">Delete my account</strong>
            <p className="muted small">Deletes your documents and personal details. Receipts are kept without your name for tax records.</p>
          </div>
          <button className="btn danger" onClick={() => setDel(true)}>
            <Icon name="trash" size={16} /> Delete account
          </button>
        </div>
        <p className="tiny muted">
          <Link to="/privacy">Privacy policy</Link> · <Link to="/refund-policy">Refund policy</Link>
        </p>
      </div>

      {del && (
        <Modal onClose={() => setDel(false)} label="Delete account">
          <span className="tile tint-coral">
            <Icon name="trash" />
          </span>
          <h2>Delete your account?</h2>
          <p className="muted small">Your uploaded documents and personal details are deleted now. This can't be undone. Orders in progress must be finished first.</p>
          <label>
            Type DELETE to confirm
            <input id="confirmDelete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <ErrorNote error={delErr} />
          <div className="row">
            <button className="btn danger solid grow" disabled={confirmText !== 'DELETE'} onClick={deleteAccount}>
              Delete my account
            </button>
            <button className="btn" onClick={() => setDel(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
