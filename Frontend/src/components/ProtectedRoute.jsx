// src/components/ProtectedRoute.jsx
import { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const token = localStorage.getItem('token');

  // ✅ Handle case where session is still loading
  if (user === undefined && token) return null;

  // ❌ If token/user is missing, send back to login
  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
