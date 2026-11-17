import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, rupees, viewDoc, saveDoc } from './api.js';
import { useAuth, isAdmin } from './auth.jsx';
import { Icon } from './icons.jsx';

/* ---------- Data loading hook shared by all pages ---------- */
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    fn()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* Animates a number from its previous value to the new one (prices, stats). */
export function useTween(value, ms = 600) {
  const [shown, setShown] = useState(reducedMotion() ? Number(value) || 0 : 0);
  const cur = useRef(reducedMotion() ? Number(value) || 0 : 0);
  useEffect(() => {
    const target = Number(value) || 0;
    if (reducedMotion()) {
      cur.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const a = cur.current;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const v = a + (target - a) * (1 - Math.pow(1 - k, 3));
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function Amount({ value, className = '' }) {
  const v = useTween(value);
  const n = Number(value) || 0;
  const shown = Number.isInteger(n) ? Math.round(v) : Math.round(v * 100) / 100;
  return <span className={className}>{rupees(shown)}</span>;
}

export function CountUp({ value }) {
  const v = useTween(value, 900);
  return <>{Math.round(v).toLocaleString('en-IN')}</>;
}

/* ---------- Cafe details (name, hours, refund policy) from the server ---------- */
const CafeCtx = createContext(null);
export function CafeProvider({ children }) {
  const { data, reload } = useLoad(() => api('/public-settings'));
  return <CafeCtx.Provider value={{ ...(data || {}), loaded: !!data, reload }}>{children}</CafeCtx.Provider>;
}
export const useCafe = () => useContext(CafeCtx) || {};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const fmtTime = (hhmm = '') => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
};
export function dayRange(days = []) {
  const d = [...days].sort();
  if (!d.length) return 'Closed';
  const short = (i) => DAYS[i].slice(0, 3);
  const consecutive = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return consecutive && d.length > 2 ? `${short(d[0])} – ${short(d[d.length - 1])}` : d.map(short).join(', ');
}
// "Open today · Until 8 PM" or "Closed · Opens Monday 9 AM"
export function openState(cafe, now = new Date()) {
  const { openTime = '09:00', closeTime = '20:00', openDays = [1, 2, 3, 4, 5, 6] } = cafe || {};
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.getDay();
  if (openDays.includes(today) && hm >= openTime && hm < closeTime) return { open: true, label: 'Open today', until: `Until ${fmtTime(closeTime)}` };
  if (openDays.includes(today) && hm < openTime) return { open: false, label: 'Opens today', until: `at ${fmtTime(openTime)}` };
  for (let i = 1; i <= 7; i++) {
    const d = (today + i) % 7;
    if (openDays.includes(d)) return { open: false, label: 'Closed now', until: `Opens ${i === 1 ? 'tomorrow' : DAYS[d]} ${fmtTime(openTime)}` };
  }
  return { open: false, label: 'Closed', until: '' };
}

/* ---------- Brand ---------- */
export function Brand({ to = '/', sub = 'Cyber Café' }) {
  const cafe = useCafe();
  return (
    <Link to={to} className="brand" aria-label={`${cafe.cafeName || 'Cyber Cafe'} home`}>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand-text">
        <span className="brand-name">{(cafe.cafeName || 'Cyber Cafe').toLowerCase()}</span>
        <span className="brand-sub">{sub}</span>
      </span>
    </Link>
  );
}

/* ---------- Layout ---------- */
const CUSTOMER_LINKS = [
  ['/', 'Overview', 'overview'],
  ['/services', 'Services', 'briefcase'],
  ['/orders', 'My orders', 'orders'],
  ['/print', 'Print services', 'printer'],
  ['/payments', 'Payments', 'wallet'],
];

function adminLinks(role) {
  return [
    ...(role === 'owner' ? [['/admin', 'Dashboard', 'overview']] : []),
    ['/admin/orders', 'Orders', 'orders'],
    ['/admin/print', 'Print queue', 'printer'],
    ...(role === 'owner'
      ? [
          ['/admin/services', 'Services', 'briefcase'],
          ['/admin/payments', 'Payments', 'wallet'],
          ['/admin/customers', 'Customers', 'users'],
          ['/admin/activity', 'Activity', 'activity'],
          ['/admin/settings', 'Settings', 'settings'],
        ]
      : [['/admin/settings', 'Password', 'key']]),
  ];
}

const TITLES = [
  [/^\/$/, 'Overview'],
  [/^\/services\/.+/, 'Service'],
  [/^\/services$/, 'Services'],
  [/^\/orders\/.+/, 'Order'],
  [/^\/orders$/, 'My orders'],
  [/^\/print$/, 'Print services'],
  [/^\/payments\/.+/, 'Receipt'],
  [/^\/payments$/, 'Payments'],
  [/^\/profile$/, 'Profile'],
  [/^\/privacy$/, 'Privacy policy'],
  [/^\/refund-policy$/, 'Refund policy'],
  [/^\/admin$/, 'Dashboard'],
  [/^\/admin\/orders\/.+/, 'Order'],
  [/^\/admin\/orders$/, 'Orders'],
  [/^\/admin\/print$/, 'Print queue'],
  [/^\/admin\/services$/, 'Services'],
  [/^\/admin\/payments$/, 'Payments'],
  [/^\/admin\/customers$/, 'Customers'],
  [/^\/admin\/activity$/, 'Activity'],
  [/^\/admin\/settings$/, 'Settings'],
];
const titleFor = (path) => TITLES.find(([re]) => re.test(path))?.[1] || '';

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

function OpenState() {
  const cafe = useCafe();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!cafe.loaded) return null;
  const s = openState(cafe, now);
  return (
    <span className={`open-state ${s.open ? '' : 'closed'}`}>
      <span className="dot" />
      {s.label}
      {s.until && <span className="until">{s.until}</span>}
    </span>
  );
}

// Counts for the sidebar badges (customer)
function useCustomerCounts(enabled, path) {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    Promise.all([api('/orders').catch(() => []), api('/print').catch(() => [])]).then(([orders, prints]) => {
      if (!live) return;
      const activeOrders = orders.filter((o) => ['PendingPayment', 'Submitted', 'In Progress'].includes(o.status)).length;
      const activePrints = prints.filter((j) => ['PendingPayment', 'Pending', 'Printing', 'Ready'].includes(j.status)).length;
      const ready = prints.filter((j) => j.status === 'Ready').length + orders.filter((o) => o.status === 'Completed' && Date.now() - new Date(o.updatedAt) < 3 * 86400000).length;
      setCounts({ orders: activeOrders + activePrints, ready });
    });
    return () => {
      live = false;
    };
  }, [enabled, path]);
  return counts;
}

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const cafe = useCafe();
  const admin = isAdmin(user);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const counts = useCustomerCounts(!!user && !admin, loc.pathname);

  const page = (
    <div key={loc.pathname} className="route">
      {children}
    </div>
  );
  // Login pages and public pages for logged-out visitors have no shell
  if (!user) {
    if (['/privacy', '/refund-policy'].includes(loc.pathname)) {
      return (
        <div className="content narrow" style={{ margin: '0 auto' }}>
          <div style={{ marginBottom: 28 }}>
            <Brand to="/login" />
          </div>
          {page}
        </div>
      );
    }
    return page;
  }

  const links = admin ? adminLinks(user.role) : CUSTOMER_LINKS;
  const doLogout = () => {
    logout();
    nav(admin ? '/admin/login' : '/login');
  };
  const title = titleFor(loc.pathname);

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`} onClick={(e) => menuOpen && e.target === e.currentTarget && setMenuOpen(false)}>
      <aside className="sidebar" aria-label="Main menu">
        <div className="row between">
          <Brand to={admin ? (user.role === 'owner' ? '/admin' : '/admin/orders') : '/'} sub={admin ? 'Admin desk' : 'Cyber Café'} />
          <button className="icon-btn plain menu-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="side-label">{admin ? 'Manage' : 'Workspace'}</div>
        <nav className="side-nav">
          {links.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/' || to === '/admin'}>
              <Icon name={icon} />
              <span>{label}</span>
              {!admin && to === '/services' && cafe.loaded && <span className="count">{String(cafe.serviceCount ?? '').padStart(2, '0')}</span>}
              {!admin && to === '/orders' && counts.orders > 0 && <span className="count hot">{counts.orders}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          {!admin && (
            <div className="side-help">
              <span className="tile sm tint-mint">
                <Icon name="headset" size={18} />
              </span>
              <strong>Need a hand?</strong>
              <span className="muted small">We're right here to help.</span>
              <a className="btn block" style={{ marginTop: 12, justifyContent: 'space-between' }} href={cafe.cafePhone ? `tel:${cafe.cafePhone.replace(/\s/g, '')}` : '/profile'}>
                Talk to our team <Icon name="arrowRight" size={16} className="arrow" />
              </a>
            </div>
          )}
          <div className="side-user">
            <span className="avatar">{initials(user.name)}</span>
            {admin ? (
              <div className="grow">
                <strong>{user.name}</strong>
                <span>{user.role === 'owner' ? 'Owner' : 'Staff'}</span>
              </div>
            ) : (
              <Link to="/profile">
                <strong>{user.name}</strong>
                <span>View profile</span>
              </Link>
            )}
            <button className="icon-btn plain" title="Log out" aria-label="Log out" onClick={doLogout}>
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="crumbs">
            <span className="ws">{admin ? 'Admin' : 'Workspace'}</span>
            <span className="sep">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-end">
            <OpenState />
            <Link className="icon-btn" to={admin ? '/admin/orders' : '/orders'} aria-label="Updates" title={counts.ready ? 'Something is ready for you' : 'Updates'}>
              <Icon name="bell" size={18} />
              {counts.ready > 0 && <span className="ping" />}
            </Link>
          </div>
        </header>
        <main className="content">
          {admin && user.mustChangePassword && !loc.pathname.startsWith('/admin/settings') && (
            <Link to="/admin/settings#password" className="note bad" style={{ marginBottom: 24 }}>
              <Icon name="key" size={18} />
              <span>
                <strong>You are using the default or a weak password.</strong> Change it now so nobody else can log in as you. <u>Change password</u>
              </span>
            </Link>
          )}
          {page}
        </main>
      </div>

      {!admin && (
        <nav className="tabbar" aria-label="Main">
          {CUSTOMER_LINKS.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon name={icon} size={22} />
              <span>{label.replace('Print services', 'Print').replace('My orders', 'Orders')}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

/* ---------- Small building blocks ---------- */
const STATUS_TONE = {
  PendingPayment: 'warn',
  Pending: 'info',
  Submitted: 'info',
  'In Progress': 'warn',
  Printing: 'info',
  Ready: 'bad',
  Completed: 'good',
  Collected: 'muted',
  Success: 'good',
  Paid: 'good',
  Rejected: 'bad',
  Failed: 'bad',
  Refunded: 'muted',
  Requested: 'warn',
  Approved: 'good',
  Declined: 'muted',
  sent: 'good',
  failed: 'bad',
  'gave-up': 'bad',
};
const STATUS_LABEL = { PendingPayment: 'Awaiting payment', Pending: 'In queue', Ready: 'Ready to collect', Success: 'Paid', 'gave-up': 'Gave up' };
const LIVE = ['Submitted', 'In Progress', 'Printing', 'Pending'];

export function Status({ value, label }) {
  return (
    <span className={`pill ${STATUS_TONE[value] || 'muted'}`}>
      {LIVE.includes(value) && <span className="dot live" />}
      {label || STATUS_LABEL[value] || value}
    </span>
  );
}

export function ErrorNote({ error }) {
  return error ? (
    <p className="error" role="alert">
      <Icon name="alert" size={18} />
      <span>{error}</span>
    </p>
  ) : null;
}

export function SuccessNote({ children }) {
  return children ? (
    <p className="success" role="status">
      <Icon name="checkCircle" size={18} />
      <span>{children}</span>
    </p>
  ) : null;
}

export function BackLink({ to, children }) {
  return (
    <Link to={to} className="back no-print">
      <Icon name="arrowLeft" size={16} /> {children}
    </Link>
  );
}

export function Eyebrow({ children, plain }) {
  return <span className={`eyebrow ${plain ? 'plain' : ''}`}>{children}</span>;
}

export function Empty({ icon = 'file', title, children, action }) {
  return (
    <div className="empty fade">
      <span className="tile lg tint-sage">
        <Icon name={icon} size={24} />
      </span>
      <strong>{title}</strong>
      {children && <p className="muted small" style={{ maxWidth: 380 }}>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3, kind = 'row' }) {
  return (
    <div className={kind === 'card' ? 'svc-grid' : 'stack-sm'} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton ${kind}`} />
      ))}
    </div>
  );
}

export function Loading() {
  return (
    <div className="stack-lg">
      <div className="skeleton title" />
      <Skeleton rows={3} />
    </div>
  );
}

export function Modal({ onClose, children, wide, label, busy }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {onClose && (
          <button className="icon-btn plain modal-x" aria-label="Close" onClick={onClose} disabled={busy}>
            <Icon name="x" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

export const fileSize = (b) => (!b ? '' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
// FR-11 / F1: check type and size before uploading, with a clear message for Word files
export function checkFile(f, maxMb = 10) {
  if (!f) return 'Choose a file.';
  if (/\.(docx?|odt|rtf)$/i.test(f.name)) return `${f.name} is a Word file. Save it as PDF first (File > Save As > PDF), then upload the PDF.`;
  if (!ALLOWED_TYPES.includes(f.type)) return `${f.name}: use a PDF, JPG or PNG file.`;
  if (f.size > maxMb * 1024 * 1024) return `${f.name} is larger than ${maxMb} MB.`;
  return '';
}

/* Upload box with drag & drop. Shows the picked file with its size. */
export function Dropzone({ id, label, hint, file, onFile, compact, accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png' }) {
  const [over, setOver] = useState(false);
  const cafe = useCafe();
  const text = hint || `PDF, JPG or PNG · Up to ${cafe.maxFileMb || 10} MB`;
  return (
    <div
      className={`dropzone ${compact ? 'compact' : ''} ${over ? 'over' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <label htmlFor={id} className="dz-inner">
        <span className="tile">
          <Icon name={file ? 'check' : 'upload'} size={20} stroke={2} />
        </span>
        <span className="stack-xs" style={{ minWidth: 0 }}>
          <strong>{label}</strong>
          {file ? (
            <span className="file-name">
              {file.name} · {fileSize(file.size)}
            </span>
          ) : (
            <span className="hint">{text}</span>
          )}
        </span>
        {file && compact && <span className="dz-change">Change</span>}
      </label>
    </div>
  );
}

/* F2: preview a picked file before uploading / paying */
export function FilePreview({ file, pages }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  if (!file || !url) return null;
  return (
    <div className="preview fade">
      {file.type === 'application/pdf' ? <iframe title="File preview" src={`${url}#toolbar=0&view=FitH`} /> : <img src={url} alt="Preview of your file" />}
      <div className="preview-bar">
        <Icon name="eye" size={16} />
        <span className="grow">Preview · check this is the right file</span>
        {pages ? (
          <strong>
            {pages} page{pages > 1 ? 's' : ''}
          </strong>
        ) : null}
      </div>
    </div>
  );
}

/* A stored document with View and Download (A1, F3, customer "save back") */
export function FileItem({ doc, onError, tone, extra }) {
  const [busy, setBusy] = useState('');
  const run = (kind, fn) => async () => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      onError?.(e.message);
    }
    setBusy('');
  };
  const isImg = /^image\//.test(doc.type || '');
  return (
    <div className={`file-item ${tone || ''}`}>
      <span className={`tile sm ${tone === 'result' ? 'tint-mint' : isImg ? 'tint-lavender' : 'tint-coral'}`}>
        <Icon name={tone === 'result' ? 'checkCircle' : isImg ? 'eye' : 'fileText'} size={18} />
      </span>
      <div className="grow">
        <div className="name">{doc.label}</div>
        <div className="meta">
          {doc.originalName}
          {doc.size ? ` · ${fileSize(doc.size)}` : ''}
          {doc.uploadedBy && doc.kind === 'result' ? ` · from ${doc.uploadedBy}` : ''}
        </div>
      </div>
      <div className="acts">
        <button className="btn sm" disabled={!!busy} onClick={run('view', () => viewDoc(doc._id))}>
          {busy === 'view' ? <span className="spinner" /> : <Icon name="eye" size={16} />} View
        </button>
        <button className="btn sm primary" disabled={!!busy} onClick={run('save', () => saveDoc(doc._id, doc.originalName))}>
          {busy === 'save' ? <span className="spinner" /> : <Icon name="download" size={16} />} Download
        </button>
        {extra}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 100, label = 'Copies' }) {
  const n = Math.max(min, Math.min(max, parseInt(value, 10) || min));
  return (
    <div className="stepper">
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={n <= min} onClick={() => onChange(n - 1)}>
        <Icon name="minus" size={16} stroke={2.4} />
      </button>
      <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => onChange(n)} />
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={n >= max} onClick={() => onChange(n + 1)}>
        <Icon name="plus" size={16} stroke={2.4} />
      </button>
    </div>
  );
}

/* ---------- Illustrations (pure SVG, no image files needed) ---------- */
export function HeroArt() {
  return (
    <svg viewBox="0 0 640 380" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wall" x1="0" x2="1">
          <stop offset="0" stopColor="#3d634f" stopOpacity="0" />
          <stop offset="1" stopColor="#c9b892" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width="640" height="380" fill="url(#wall)" />
      {/* shelf */}
      <rect x="470" y="40" width="150" height="8" rx="2" fill="#e8dcc0" opacity="0.7" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={480 + i * 26} y={12} width="18" height="28" rx="2" fill={['#3f6db3', '#e0715c', '#f6d98a', '#7258c0', '#2a8467'][i]} opacity="0.75" />
      ))}
      {/* desk */}
      <rect x="150" y="268" width="520" height="16" rx="3" fill="#c9a77a" />
      <rect x="150" y="284" width="520" height="110" fill="#b58f62" opacity="0.85" />
      {/* monitor */}
      <g className="float d2">
        <rect x="430" y="150" width="140" height="92" rx="6" fill="#1d2a24" />
        <rect x="438" y="158" width="124" height="76" rx="3" fill="#2f4a3e" />
        <rect x="448" y="170" width="70" height="6" rx="3" fill="#8fb9a3" />
        <rect x="448" y="184" width="96" height="5" rx="2.5" fill="#5f8a74" />
        <rect x="448" y="196" width="84" height="5" rx="2.5" fill="#5f8a74" />
        <rect x="492" y="242" width="16" height="26" fill="#1d2a24" />
        <rect x="472" y="262" width="56" height="6" rx="3" fill="#1d2a24" />
      </g>
      {/* printer */}
      <g>
        <rect x="250" y="204" width="130" height="64" rx="10" fill="#f4f1ea" />
        <rect x="262" y="190" width="106" height="20" rx="5" fill="#e3ddd0" />
        <rect x="270" y="236" width="90" height="6" rx="3" fill="#cfc8b8" />
        <circle cx="362" cy="220" r="4" fill="#2a8467" />
        <g className="paper">
          <rect x="280" y="248" width="70" height="44" rx="2" fill="#ffffff" />
          <rect x="288" y="258" width="40" height="4" rx="2" fill="#d9d2c3" />
          <rect x="288" y="267" width="52" height="4" rx="2" fill="#e6e0d3" />
        </g>
      </g>
      {/* plant */}
      <g className="float">
        <rect x="186" y="226" width="40" height="42" rx="6" fill="#e9e4d8" />
        <path d="M206 228c-18-30-40-36-46-62 22 6 38 24 46 62z" fill="#3e8a62" />
        <path d="M206 228c4-36 20-56 40-64-2 26-18 46-40 64z" fill="#2f7352" />
        <path d="M206 228c-6-28-2-52 10-72 8 24 2 48-10 72z" fill="#4f9d73" />
      </g>
      {/* paper stack */}
      <rect x="560" y="246" width="70" height="8" rx="2" fill="#f7f3ea" />
      <rect x="556" y="254" width="76" height="8" rx="2" fill="#efe9dc" />
      <rect x="560" y="262" width="70" height="6" rx="2" fill="#f7f3ea" />
    </svg>
  );
}

export function VisitArt() {
  return (
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="150" fill="#e7e1d3" />
      <rect y="96" width="400" height="54" fill="#cdb08a" />
      <rect y="92" width="400" height="6" fill="#bf9f76" />
      <rect x="40" y="52" width="110" height="44" rx="8" fill="#f6f3ec" />
      <rect x="52" y="44" width="86" height="12" rx="4" fill="#ded7c8" />
      <circle cx="136" cy="64" r="3" fill="#2a8467" />
      <rect x="64" y="84" width="62" height="18" rx="2" fill="#fff" />
      <rect x="196" y="58" width="34" height="34" rx="5" fill="#f0ebe0" />
      <path d="M213 60c-10-18-22-20-26-34 12 4 20 14 26 34zM213 60c2-20 12-30 22-34-1 14-10 26-22 34z" fill="#3e8a62" />
      <rect x="280" y="30" width="90" height="62" rx="5" fill="#1d2a24" />
      <rect x="286" y="36" width="78" height="48" rx="2" fill="#35584a" />
      <rect x="318" y="92" width="14" height="6" fill="#1d2a24" />
    </svg>
  );
}

/* ---------- Payment ---------- */
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

// Confirmation shown after a successful payment
function PaidStamp({ amount, onFinish }) {
  useEffect(() => {
    const t = setTimeout(onFinish, reducedMotion() ? 600 : 1800);
    return () => clearTimeout(t);
  }, [onFinish]);
  return createPortal(
    <div className="modal-back" role="status" aria-live="polite">
      <div className="stamp-card">
        <div className="stamp">
          <Icon name="check" size={56} stroke={2.4} />
        </div>
        <h2 className="serif">Payment received</h2>
        <p className="muted">{rupees(amount)} paid · your receipt is ready</p>
      </div>
    </div>,
    document.body
  );
}

// FR-15/16/17: pay with Razorpay (or the test popup in development). Retry = click again.
export function PayButton({ kind, id, amount, onDone, label, size = '', block }) {
  const cafe = useCafe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mock, setMock] = useState(null);
  const [stamp, setStamp] = useState(null);

  async function start() {
    setError('');
    setBusy(true);
    try {
      const p = await api('/payments/create', { method: 'POST', body: { kind, id } });
      if (p.free) {
        setBusy(false);
        return onDone?.();
      }
      if (p.mock) return setMock(p);
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: p.keyId,
        order_id: p.razorpayOrderId,
        amount: Math.round(p.amount * 100),
        currency: 'INR',
        name: cafe.cafeName || 'Cyber Cafe',
        theme: { color: '#1F5C45' },
        prefill: p.prefill,
        handler: async (resp) => {
          try {
            await api('/payments/verify', { method: 'POST', body: { paymentId: p.paymentId, ...resp } });
            setStamp(p.amount);
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
    const amt = mock.amount;
    setMock(null);
    try {
      await api('/payments/mock-confirm', { method: 'POST', body: { paymentId: mock.paymentId, outcome } });
      if (outcome === 'success') {
        setBusy(false);
        return setStamp(amt);
      }
      setError('Test payment failed. You can try again.');
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
    onDone?.();
  }

  return (
    <div className="stack-sm">
      <button className={`btn primary ${size} ${block ? 'block' : ''}`} disabled={busy} onClick={start}>
        {busy ? (
          <>
            <span className="spinner" /> Opening payment…
          </>
        ) : (
          <>
            <Icon name="lock" size={16} /> {label || (amount > 0 ? `Pay ${rupees(amount)}` : 'Submit free request')}
          </>
        )}
      </button>
      <ErrorNote error={error} />
      {mock && (
        <Modal onClose={() => finishMock('fail')} label="Test payment">
          <div className="row">
            <span className="tile tint-butter">
              <Icon name="wallet" />
            </span>
            <div>
              <h3>Test payment</h3>
              <p className="muted small">Razorpay keys are not set, so this payment is simulated (development only).</p>
            </div>
          </div>
          <div className="big-price">{rupees(mock.amount)}</div>
          <div className="row">
            <button className="btn primary grow" onClick={() => finishMock('success')}>
              <Icon name="check" size={16} /> Pay successfully
            </button>
            <button className="btn grow" onClick={() => finishMock('fail')}>
              Simulate failure
            </button>
          </div>
        </Modal>
      )}
      {stamp !== null && (
        <PaidStamp
          amount={stamp}
          onFinish={() => {
            setStamp(null);
            onDone?.();
          }}
        />
      )}
    </div>
  );
}
