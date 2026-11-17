// One place that lists every customer screen.
// Screens already moved to their own file are exported from there;
// the rest still come from the old Customer.jsx until we move them.
export { Login } from './Login.jsx';
export { Profile } from './Profile.jsx';
export { Overview, Services, ServiceOrder, MyOrders, OrderDetail, PrintPage, Payments, Receipt } from '../Customer.jsx';