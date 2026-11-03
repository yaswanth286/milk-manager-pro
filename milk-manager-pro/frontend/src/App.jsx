import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { PageHeaderProvider } from './context/PageHeaderContext';
import ProtectedRoute, { StaffOnly, HomeRedirect } from './routes/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login/Login';

const Dashboard      = lazy(() => import('./pages/Dashboard/Dashboard'));
const Customers      = lazy(() => import('./pages/Customers/Customers'));
const CustomerDetails= lazy(() => import('./pages/CustomerDetails/CustomerDetails'));
const AddCustomer    = lazy(() => import('./pages/AddCustomer/AddCustomer'));
const MorningDelivery= lazy(() => import('./pages/MorningDelivery/MorningDelivery'));
const EveningDelivery= lazy(() => import('./pages/EveningDelivery/EveningDelivery'));
const Bills          = lazy(() => import('./pages/Bills/Bills'));
const Products       = lazy(() => import('./pages/Products/Products'));
const Settings       = lazy(() => import('./pages/Settings/Settings'));
const More           = lazy(() => import('./pages/Settings/More'));

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div className="spinner" />
    </div>
  );
}

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
                    <Route path="/dashboard" element={<StaffOnly><Dashboard /></StaffOnly>} />

                    <Route path="/customers"          element={<StaffOnly><Customers /></StaffOnly>} />
                    <Route path="/customers/new"      element={<StaffOnly><AddCustomer /></StaffOnly>} />
                    <Route path="/customers/:id"      element={<StaffOnly><CustomerDetails /></StaffOnly>} />
                    <Route path="/customers/:id/edit" element={<StaffOnly><AddCustomer /></StaffOnly>} />

                    <Route path="/delivery/morning" element={<StaffOnly><MorningDelivery /></StaffOnly>} />
                    <Route path="/delivery/evening" element={<StaffOnly><EveningDelivery /></StaffOnly>} />

                    <Route path="/bills"    element={<StaffOnly><Bills /></StaffOnly>} />
                    <Route path="/products" element={<StaffOnly><Products /></StaffOnly>} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/more"     element={<StaffOnly><More /></StaffOnly>} />
                  </Route>

                  <Route path="/"         element={<HomeRedirect />} />
                  <Route path="/dashboard" element={<HomeRedirect />} />
                  <Route path="*"         element={<HomeRedirect />} />
                </Routes>
              </Suspense>
            </PageHeaderProvider>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
