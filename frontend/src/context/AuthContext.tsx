import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getMyTeamRole } from "@/api/services";
import type { TeamRole } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<AuthError | null>;
  signOut: () => Promise<void>;
  displayName: string;
  email: string;
  /**
   * Fetch role for this user in a given team via the backend (service-role key,
   * bypasses Supabase RLS). Returns null if not a member or on error.
   */
  getTeamRole: (teamId: string) => Promise<TeamRole | null>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, loading: false });
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthError | null> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ?? null;
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /**
   * Routes through the FastAPI backend (/teams/{id}/my-role) which uses the
   * service-role key — bypasses Supabase RLS completely.
   * Waits until state.user is populated before querying.
   */
  const getTeamRole = useCallback(
    async (teamId: string): Promise<TeamRole | null> => {
      const userId = state.user?.id;

      if (!userId || !teamId) {
        return null;
      }

      try {
        const result = await getMyTeamRole(teamId, userId);
        const role = result.role as TeamRole | null;
        return role;
      } catch (err) {
        console.error("[AuthContext] getTeamRole failed:", err);
        return null;
      }
    },
    [state.user?.id]
  );

  const userEmail = state.user?.email ?? "";
  const displayName =
    (state.user?.user_metadata?.full_name as string | undefined) ||
    (state.user?.user_metadata?.name as string | undefined) ||
    (userEmail ? userEmail.split("@")[0] : "User");

  return (
    <AuthContext.Provider
      value={{ ...state, signIn, signOut, displayName, email: userEmail, getTeamRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
