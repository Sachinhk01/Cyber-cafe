import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import { AuthProvider, Protected } from './auth.jsx';
import { Layout } from './components.jsx';
import { Login, Dashboard, ServiceOrder, OrderDetail, PrintPage, Receipts, Receipt, Profile } from './pages/Customer.jsx';
import {
  AdminLogin,
  AdminDashboard,
  AdminOrders,
  AdminOrderDetail,
  AdminPrintQueue,
  AdminServices,
  AdminPayments,
  AdminCustomers,
  AdminSettings,
} from './pages/Admin.jsx';

const C = ({ children }) => <Protected roles={['customer']}>{children}</Protected>;
const A = ({ children }) => <Protected roles={['owner', 'staff']}>{children}</Protected>;
const O = ({ children }) => <Protected roles={['owner']}>{children}</Protected>;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<C><Dashboard /></C>} />
            <Route path="/services/:id" element={<C><ServiceOrder /></C>} />
            <Route path="/orders/:id" element={<C><OrderDetail /></C>} />
            <Route path="/print" element={<C><PrintPage /></C>} />
            <Route path="/receipts" element={<C><Receipts /></C>} />
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
            <Route path="/admin/settings" element={<O><AdminSettings /></O>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
