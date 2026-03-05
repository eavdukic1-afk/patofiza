import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Welcome from "./pages/Welcome";
import StudentDashboard from "./pages/StudentDashboard";
import MojeSesije from "./pages/MojeSesije";
import MojProfil from "./pages/MojProfil";
import Uputstva from "./pages/Uputstva";
import Kontakt from "./pages/Kontakt";
import Timer from "./pages/Timer";
import SessionHistory from "./pages/SessionHistory";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminSupport from "./pages/AdminSupport";
import AdminSesije from "./pages/AdminSesije";
import ProtectedRoute from "./auth/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/welcome"
        element={
          <ProtectedRoute allowAdmin>
            <Welcome />
          </ProtectedRoute>
        }
      />

      {/* Student Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <StudentDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/sesije"
        element={
          <ProtectedRoute>
            <MojeSesije />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profil"
        element={
          <ProtectedRoute>
            <MojProfil />
          </ProtectedRoute>
        }
      />

      <Route
        path="/uputstva"
        element={
          <ProtectedRoute>
            <Uputstva />
          </ProtectedRoute>
        }
      />

      <Route
        path="/kontakt"
        element={
          <ProtectedRoute>
            <Kontakt />
          </ProtectedRoute>
        }
      />

      <Route
        path="/timer/:type/:subjectId"
        element={
          <ProtectedRoute>
            <Timer />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute requireAdmin>
            <AdminUsers />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/support"
        element={
          <ProtectedRoute requireAdmin>
            <AdminSupport />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/sesije/:userId"
        element={
          <ProtectedRoute requireAdmin>
            <AdminSesije />
          </ProtectedRoute>
        }
      />

            <Route path="/admin/users" element={<Navigate to="/admin" replace />} />


            <Route path="/admin/sessions" element={<Navigate to="/admin" replace />} />


      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}