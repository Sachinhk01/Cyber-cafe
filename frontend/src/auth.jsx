import { createContext, useContext, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const AuthCtx = createContext(null);

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user')) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (localStorage.getItem('token') ? readUser() : null));

  const login = (token, u) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };
  const updateUser = (u) => {
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  };

  return <AuthCtx.Provider value={{ user, login, logout, updateUser }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
export const isAdmin = (u) => u && (u.role === 'owner' || u.role === 'staff');

// FR-5: role-protected routes
export function Protected({ roles, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  const adminArea = roles.some((r) => r !== 'customer');
  if (!user || !localStorage.getItem('token')) {
    return <Navigate to={adminArea ? '/admin/login' : '/login'} replace state={{ from: loc.pathname }} />;
  }
  if (!roles.includes(user.role)) {
    const home = user.role === 'owner' ? '/admin' : user.role === 'staff' ? '/admin/orders' : '/';
    return <Navigate to={home} replace />;
  }
  return children;
}
