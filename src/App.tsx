import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { AddProperty } from './pages/AddProperty';
import { SearchProperties } from './pages/SearchProperties';
import { BuyerRequirements } from './pages/BuyerRequirements';
import { Settings } from './pages/Settings';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
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
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
