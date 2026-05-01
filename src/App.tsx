import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import ClientDashboard from './pages/ClientDashboard';
import Profile from './pages/Profile';
import DashboardLayout from './components/DashboardLayout';

const ProtectedRoute = ({ children, role }: { children: React.ReactNode, role?: 'admin' | 'client' }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (role && profile?.role !== role) return <Navigate to="/" />;

  return <>{children}</>;
};

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }>
            <Route path="/dashboard" element={<DashboardRedirect />} />
            <Route path="/admin" element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/client" element={
              <ProtectedRoute role="client">
                <ClientDashboard />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

function DashboardRedirect() {
  const { profile } = useAuth();
  if (profile?.role === 'admin') return <Navigate to="/admin" />;
  return <Navigate to="/client" />;
}
