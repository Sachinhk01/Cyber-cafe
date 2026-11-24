import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import { AuthProvider, Protected } from './auth.jsx';
import { Layout, CafeProvider } from './components.jsx';
import { Login } from './pages/customer/Login.jsx';
import { Overview, Services, ServiceOrder, MyOrders, OrderDetail, PrintPage, Payments, Receipt, Profile } from './pages/Customer.jsx';
import {
  AdminLogin,
  AdminDashboard,
  AdminOrders,
  AdminOrderDetail,
  AdminPrintQueue,
  AdminServices,
  AdminPayments,
  AdminCustomers,
  AdminActivity,
  AdminSettings,
} from './pages/Admin.jsx';
import { Privacy, RefundPolicy } from './pages/Legal.jsx';
import { ForgotPassword, ResetPassword } from './pages/ResetPassword.jsx';

const C = ({ children }) => <Protected roles={['customer']}>{children}</Protected>;
const A = ({ children }) => <Protected roles={['owner', 'staff']}>{children}</Protected>;
const O = ({ children }) => <Protected roles={['owner']}>{children}</Protected>;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CafeProvider>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/" element={<C><Overview /></C>} />
              <Route path="/services" element={<C><Services /></C>} />
              <Route path="/services/:id" element={<C><ServiceOrder /></C>} />
              <Route path="/orders" element={<C><MyOrders /></C>} />
              <Route path="/orders/:id" element={<C><OrderDetail /></C>} />
              <Route path="/print" element={<C><PrintPage /></C>} />
              <Route path="/payments" element={<C><Payments /></C>} />
              <Route path="/payments/:id" element={<C><Receipt /></C>} />
              <Route path="/receipts" element={<Navigate to="/payments" replace />} />
              <Route path="/receipts/:id" element={<C><Receipt /></C>} />
              <Route path="/profile" element={<C><Profile /></C>} />

              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<O><AdminDashboard /></O>} />
              <Route path="/admin/orders" element={<A><AdminOrders /></A>} />
              <Route path="/admin/orders/:id" element={<A><AdminOrderDetail /></A>} />
              <Route path="/admin/print" element={<A><AdminPrintQueue /></A>} />
              <Route path="/admin/services" element={<O><AdminServices /></O>} />
              <Route path="/admin/payments" element={<O><AdminPayments /></O>} />
              <Route path="/admin/customers" element={<O><AdminCustomers /></O>} />
              <Route path="/admin/activity" element={<O><AdminActivity /></O>} />
              <Route path="/admin/settings" element={<A><AdminSettings /></A>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </CafeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
