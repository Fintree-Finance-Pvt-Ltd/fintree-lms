// import { useContext } from 'react';
// import { AuthContext } from '../context/AuthContext';
// import { useLocation } from 'react-router-dom';

// const PermissionRoute = ({ children }) => {
//   const { user } = useContext(AuthContext);
//   const location = useLocation();

//   const allowedPages = user?.pages || [];
//   const currentPath = location.pathname;

//   const hasAccess = allowedPages.some((p) => {
//     const topLevel = `/${p.path.split('/')[1]}`;
//     return currentPath.startsWith(topLevel);
//   });

//   return hasAccess ? children : <p>🚫 Access Denied</p>;
// };

// export default PermissionRoute;



// import { useContext } from 'react';
// import { AuthContext } from '../context/AuthContext';
// import { useLocation } from 'react-router-dom';

// const PermissionRoute = ({ children }) => {
//   const { user } = useContext(AuthContext);
//   const location = useLocation();

//   const allowedPages = user?.pages || [];
//   const currentPath = location.pathname;

//   const hasAccess = allowedPages.some((p) => {
//     const topLevel = `/${p.path.split('/')[1]}`;

//     // ✅ Exception for loan details:
//     if (currentPath.startsWith('/approved-loan-details')) {
//       // Allow if the user has any Approved Loans page
//       return p.path.includes('/approved');
//     }

//     // ✅ Exception for MIS detail pages:
//     if (currentPath.startsWith('/mis-reports')) {
//       return p.path.includes('/mis-reports');
//     }

//     return currentPath.startsWith(topLevel);
//   });

//   return hasAccess ? children :<p>🚫 Access Denied </p>;
// };
 
// export default PermissionRoute;



import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

const PermissionRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();

  if (!user) return null;

  const allowedPages = user.pages || [];
  const currentPath = location.pathname;

   // ✅ Always allow dashboard
  if (currentPath === '/dashboard') {
    return children;
  }

  const hasAccess = allowedPages.some((p) => {
    const topLevel = `/${p.path.split('/')[1]}`;

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


