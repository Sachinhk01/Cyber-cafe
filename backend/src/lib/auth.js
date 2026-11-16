import jwt from 'jsonwebtoken';
import { User } from '../models.js';

export const isAdminRole = (role) => role === 'owner' || role === 'staff';

// D7: shorter sessions. Customers stay signed in for 3 days, staff/owner for 12 hours.
const expiryFor = (role) =>
  isAdminRole(role) ? process.env.ADMIN_JWT_EXPIRES_IN || '12h' : process.env.JWT_EXPIRES_IN || '3d';

export function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name, v: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: expiryFor(user.role) }
  );
}

// auth() = any logged-in user, auth(['owner']) = only those roles.
// Every request checks the database, so a removed staff login, a deleted customer
// account, or "log out everywhere" takes effect immediately (D7).
export function auth(roles) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please log in.' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    try {
      const current = await User.findById(payload.id).select('role name tokenVersion').lean();
      if (!current || current.role !== payload.role || (current.tokenVersion || 0) !== (payload.v || 0)) {
        return res.status(401).json({
          error: isAdminRole(payload.role) ? 'This login was removed or signed out. Log in again.' : 'Please log in again.',
        });
      }
      req.user = { id: payload.id, role: current.role, name: current.name };
    } catch (e) {
      return next(e);
    }
    if (roles && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this.' });
    }
    next();
  };
}

// Wrap async route handlers so errors reach the error middleware
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// D5: strong password rule for owner and staff
export function checkStrongPassword(pw) {
  const p = String(pw || '');
  if (p.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return 'Use letters and numbers.';
  if (/^changeme/i.test(p) || /password|123456|qwerty/i.test(p)) return 'That password is too easy to guess.';
  return null;
}
export const DEFAULT_PASSWORDS = ['ChangeMe@123'];
