import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';

const PermissionRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const token = localStorage.getItem('token');

  if (user === undefined && token) return null;

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const allowedPages = user.pages || [];
  const currentPath = location.pathname;

   // ✅ Always allow dashboard
  if (currentPath === '/dashboard') {
    return children;
  }

  const hasAccess = allowedPages.some((p) => {
    const topLevel = `/${p.path.split('/')[1]}`;

    console.log("PATH:", currentPath);
console.log("PAGES:", allowedPages);

    if (currentPath.startsWith('/approved-loan-details')) {
  return allowedPages.some(p =>
    p.path.toLowerCase().includes('approved')
  );
}

    // ✅ Exception for approved-loan-details
    if (currentPath.startsWith('/approved-loan-details')) {
      return p.path.includes('/approved');
    }



    // ✅ ✅ FIXED: Exception for loan-details
   // ✅ Allow loan-details if user has any loans-related access
if (currentPath.startsWith('/loan-details')) {
  return allowedPages.some(p => p.path.includes('/approved') || p.path.includes('/all') || p.path.includes('/disbursed'));
}


    // ✅ Exception for MIS detail pages:
    if (currentPath.startsWith('/mis-reports')) {
      return p.path.includes('/mis-reports');
    }

    return currentPath.startsWith(topLevel);
  });

  return hasAccess ? children : (
    <div style={{ backgroundColor: 'black' }}>
      <p style={{ textAlign: 'center', marginTop: '200px', color: 'white' }}>
        🚫 Access Denied
      </p>
    </div>
  );
};

export default PermissionRoute;


