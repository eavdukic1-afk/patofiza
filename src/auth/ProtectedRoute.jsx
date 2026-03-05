import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { useRole } from "./useRole";

/**
 * ProtectedRoute
 * - Default usage (student pages): requires login, and blocks admins by redirecting them to /admin
 * - Admin pages: pass requireAdmin to allow only admins
 * - Shared pages (e.g. /welcome): pass allowAdmin to allow both roles
 */
export default function ProtectedRoute({ children, requireAdmin = false, allowAdmin = false }) {
  const { user, loading } = useAuth();
  const { role, roleLoading } = useRole();

  if (loading || roleLoading) {
    return <div style={{ padding: 40 }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin-only page but user isn't admin
  if (requireAdmin && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  // Student page but user is admin (unless explicitly allowed)
  if (!requireAdmin && !allowAdmin && role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
