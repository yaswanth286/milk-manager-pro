import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { PageHeaderProvider } from './context/PageHeaderContext';
import ProtectedRoute from './routes/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login/Login';

// Route-level code splitting: each page's JS (and the heavier libraries
// only it needs, like Recharts on the Dashboard) is fetched on demand
// instead of all being bundled into one huge file the browser has to
// download before showing anything - keeps the first paint fast even as
// the app grows.
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Customers = lazy(() => import('./pages/Customers/Customers'));
const CustomerDetails = lazy(() => import('./pages/CustomerDetails/CustomerDetails'));
const AddCustomer = lazy(() => import('./pages/AddCustomer/AddCustomer'));
const MorningDelivery = lazy(() => import('./pages/MorningDelivery/MorningDelivery'));
const EveningDelivery = lazy(() => import('./pages/EveningDelivery/EveningDelivery'));
const Payments = lazy(() => import('./pages/Payments/Payments'));
const Reports = lazy(() => import('./pages/Reports/Reports'));
const Bills = lazy(() => import('./pages/Bills/Bills'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const More = lazy(() => import('./pages/Settings/More'));

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div className="spinner" />
    </div>
  );
}

// The Layout (sidebar + topbar) is rendered ONCE here and stays mounted
// across navigations - only the <Outlet /> content inside it swaps, which
// is what makes page transitions feel smooth instead of the whole app
// shell flickering on every click. ProtectedRoute wraps it so the entire
// section requires login.
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Layout />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <PageHeaderProvider>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />

                  <Route element={<ProtectedLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />

                    <Route path="/customers" element={<Customers />} />
                    <Route path="/customers/new" element={<AddCustomer />} />
                    <Route path="/customers/:id" element={<CustomerDetails />} />
                    <Route path="/customers/:id/edit" element={<AddCustomer />} />

                    <Route path="/delivery/morning" element={<MorningDelivery />} />
                    <Route path="/delivery/evening" element={<EveningDelivery />} />

                    <Route path="/payments" element={<Payments />} />
                    <Route path="/payments/new" element={<Payments />} />

                    <Route path="/reports" element={<Reports />} />
                    <Route path="/bills" element={<Bills />} />

                    <Route path="/settings" element={<Settings />} />
                    <Route path="/more" element={<More />} />
                  </Route>

                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </PageHeaderProvider>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
