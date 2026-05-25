import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  // Check if your trainer session token exists in localStorage
  const token = localStorage.getItem('token'); 

  // If there's no token, redirect them instantly back to the main trainee login page
  if (!token) {
    return <Navigate to="/" replace />;
  }

  // If a token exists, let them pass through to the protected route smoothly
  return <Outlet />;
}