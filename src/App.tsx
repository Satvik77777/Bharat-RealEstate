import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';

// Lazy load route pages for optimal initial bundle size and sub-second load times
const AddProperty = React.lazy(() =>
  import('./pages/AddProperty').then((m) => ({ default: m.AddProperty }))
);
const SearchProperties = React.lazy(() =>
  import('./pages/SearchProperties').then((m) => ({ default: m.SearchProperties }))
);
const BuyerRequirements = React.lazy(() =>
  import('./pages/BuyerRequirements').then((m) => ({ default: m.BuyerRequirements }))
);
const Settings = React.lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings }))
);

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[50vh] p-8">
    <div className="flex flex-col items-center gap-2.5">
      <div className="w-8 h-8 border-3 border-brand-600 dark:border-brand-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide">
        Loading...
      </span>
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Direct Dashboard Access - No login required */}
                <Route path="/login" element={<Navigate to="/search" replace />} />

                {/* All Protected Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Navigate to="/search" replace />} />
                    <Route path="/add" element={<AddProperty />} />
                    <Route path="/search" element={<SearchProperties />} />
                    <Route path="/buyers" element={<BuyerRequirements />} />

                    {/* Admin Only Route */}
                    <Route element={<ProtectedRoute adminOnly />}>
                      <Route path="/settings" element={<Settings />} />
                    </Route>
                  </Route>
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/search" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
