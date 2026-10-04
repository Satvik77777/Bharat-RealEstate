import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, AlertCircle, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  adminOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ adminOnly = false }) => {
  const { user, profile, hasAccess, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Not authenticated at all -> Redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated in auth.users, but NO profile row in public.profiles:
  // "All role checks treat a missing profile as no access, not as an error."
  if (!hasAccess || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl p-6 border border-rose-200 dark:border-rose-900/50 shadow-xl text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            Your login is valid, but your profile has not been configured in the system.
            Please ask the administrator to grant your account access.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium rounded-xl hover:opacity-90 transition-opacity"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  // Admin-only route requested, but role is staff
  if (adminOnly && !isAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Administrator Access Required</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          This section is restricted to administrators. Staff members cannot access these settings.
        </p>
      </div>
    );
  }

  return <Outlet />;
};
