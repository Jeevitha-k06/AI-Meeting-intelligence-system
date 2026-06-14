import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "@/components/shared/LoadingState";

/**
 * Wraps protected routes.
 * - While Supabase resolves the initial session: shows a full-screen spinner.
 * - If no session: redirects to /login, preserving the attempted URL.
 * - If authenticated: renders children via <Outlet />.
 */
export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000008] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
