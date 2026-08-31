import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
    id: string;
    email: string;
    name: string;
    role?: string;
    permissions?: any[];
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    setAuth: (user: User, token: string) => void;
    /** Update user data (e.g. fresh permissions) without changing the token */
    setUser: (user: User) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user: User, token: string) => {
          set({ user, token, isAuthenticated: true });
      },
      setUser: (user: User) => {
          set({ user, isAuthenticated: true });
      },
      logout: () => {
          set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

/**
 * Refresh the current user's permissions from the server.
 * Call this after permissions are assigned/removed mid-session so hasPerm() works immediately.
 */
export const refreshUserSession = async () => {
    try {
        const { token, setUser, logout } = useAuthStore.getState();
        if (!token) return;

        const apiUrl = (import.meta as any).env?.VITE_API_URL || '';
        const res = await fetch(`${apiUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            if (res.status === 401) logout();
            return;
        }

        const json = await res.json();
        const u = json?.data?.user || json?.user || json?.data || json;

        if (u && (u.id || u.username || u.email)) {
            setUser({
                id: String(u.id || ''),
                email: u.email || '',
                name: u.full_name || u.username || u.name || '',
                role: u.role || '',
                permissions: u.permissions || [],
            });
        }
    } catch (_) {
        // silently fail
    }
};
