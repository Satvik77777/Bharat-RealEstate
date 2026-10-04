import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Profile, UserRole } from '../types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  isAdmin: boolean;
  isStaff: boolean;
  hasAccess: boolean; // false if no profile row
  isLoading: boolean;
  isConfigured: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  demoLogin: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultAdminUser: User = {
  id: '00000000-0000-0000-0000-000000000001',
  app_metadata: {},
  user_metadata: { full_name: 'Dealer Admin' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as User;

const defaultAdminProfile: Profile = {
  user_id: '00000000-0000-0000-0000-000000000001',
  full_name: 'Dealer Admin',
  role: 'admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(defaultAdminUser);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(defaultAdminProfile);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch profile row securely
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        // Treat error or missing profile as no access, NOT as unhandled throw
        setProfile(null);
        return;
      }

      setProfile(data as Profile);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Check if simulated demo session is in localStorage
      const demoUser = localStorage.getItem('re_demo_user');
      if (demoUser) {
        try {
          const parsed = JSON.parse(demoUser);
          setUser(parsed.user);
          setProfile(parsed.profile);
        } catch {
          // ignore
        }
      }
      setIsLoading(false);
      return;
    }

    // Live Supabase Auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured) {
        return { error: 'Supabase credentials are not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or use the Demo mode below.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        await fetchProfile(data.user.id);
      }
      return {};
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error during sign in';
      return { error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      localStorage.removeItem('re_demo_user');
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      setUser(null);
      setSession(null);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Demo login for testing when live DB is not yet connected
  const demoLogin = (selectedRole: UserRole) => {
    const mockUser = {
      id: selectedRole === 'admin' ? '11111111-1111-1111-1111-111111111111' : '22222222-2222-2222-2222-222222222222',
      email: `${selectedRole}@realestate.internal`,
      app_metadata: {},
      user_metadata: { full_name: selectedRole === 'admin' ? 'Demo Admin' : 'Demo Staff' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User;

    const mockProfile: Profile = {
      user_id: mockUser.id,
      full_name: selectedRole === 'admin' ? 'Demo Admin' : 'Demo Staff',
      role: selectedRole,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStorage.setItem('re_demo_user', JSON.stringify({ user: mockUser, profile: mockProfile }));
    setUser(mockUser);
    setProfile(mockProfile);
  };

  // Missing profile means no access
  const hasAccess = Boolean(profile && (profile.role === 'admin' || profile.role === 'staff'));
  const role = profile?.role ?? null;
  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isAdmin,
        isStaff,
        hasAccess,
        isLoading,
        isConfigured: isSupabaseConfigured,
        login,
        logout,
        demoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
