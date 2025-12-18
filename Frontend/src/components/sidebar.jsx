// import { useContext } from 'react';
// import { AuthContext } from '../context/AuthContext';
// import { Link } from 'react-router-dom';

// const Sidebar = () => {
//   const { user } = useContext(AuthContext);
//   console.log('👉 Sidebar user:', user);
//   console.log("👉 Sidebar is rendering");


//   if (!user) return null;

//   const allowedPages = user.pages || [];

//   // Group pages by category if needed
//   const misPages = allowedPages.filter(p => p.path.includes('/mis-reports'));
//   const aldunPages = allowedPages.filter(p => p.path.includes('/aldun-loans'));
//   const evPages = allowedPages.filter(p => p.path.includes('/ev-loans'));
//   const gqfsfPages = allowedPages.filter(p => p.path.includes('/gq-fsf-loans'));
//   const gqnonfsfPages = allowedPages.filter(p => p.path.includes('/gq-non-fsf-loans'));
//   const adikoshPages = allowedPages.filter(p => p.path.includes('/adikosh-loans'));
//   const circlepePages = allowedPages.filter(p => p.path.includes('/circlepe-loans'));
//   const blloansPages = allowedPages.filter(p => p.path.includes('/business-loans'));
//   const hcpages = allowedPages.filter(p => p.path.includes('/health-care-loans'));

//     const groupedIds = [
//     ...misPages,
//     ...aldunPages,
//     ...evPages,
//     ...gqfsfPages,
//     ...gqnonfsfPages,
//     ...adikoshPages,
//     ...circlepePages,
//     ...blloansPages,
//     ...hcpages
//   ].map(p => p.id);

//   const otherPages = allowedPages.filter(p => !groupedIds.includes(p.id));

//   return (
//     <aside className="sidebar">
//       <h3>Menu</h3>

//       <ul>

//         {otherPages.length > 0 && (
//           <>
//             <li><strong>General</strong></li>
//             {otherPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )} 

//         {misPages.length > 0 && (
//           <>
//             <li><strong>MIS Reports</strong></li>
//             {misPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}

//         {aldunPages.length > 0 && (
//           <>
//             <li><strong>Aldun Loans</strong></li>
//             {aldunPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}

//         {evPages.length > 0 && (
//           <>
//             <li><strong>EV Loans</strong></li>
//             {evPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}

//         {hcpages.length > 0 && (
//           <>
//             <li><strong>Health Care Loans</strong></li>
//             {hcpages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}
        

//         {blloansPages.length > 0 && (
//           <>
//             <li><strong>Business Loans</strong></li>
//             {blloansPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}

//         {gqfsfPages.length > 0 && (
//           <>
//             <li><strong>GQ FSF Loans</strong></li>
//             {gqfsfPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}

//         {gqnonfsfPages.length > 0 && (
//           <>
//             <li><strong>GQ Non-FSF Loans</strong></li>
//             {gqnonfsfPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}

//         {adikoshPages.length > 0 && (
//           <>
//             <li><strong>Adikosh Loans</strong></li>
//             {adikoshPages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}

//         {circlepePages.length > 0 && (
//           <>
//             <li><strong>CirclePe Loans</strong></li>
//             {circlepePages.map(p => (
//               <li key={p.id}><Link to={p.path}>{p.name}</Link></li>
//             ))}
//           </>
//         )}
//       </ul>
//     </aside>
//   );
// };

// export default Sidebar;

import { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import '../styles/Sidebar.css';

const Sidebar = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();

  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    // Expand the group matching the current route
    const currentPath = location.pathname;
    const groups = Object.keys(grouped);
    groups.forEach(group => {
      if (grouped[group].some(p => currentPath.startsWith(p.path))) {
        setExpanded(prev => ({ ...prev, [group]: true }));
      }
    });
  }, [location.pathname]);

  if (!user) return null;

  const allowedPages = user.pages || [];

  const grouped = {
    LoanBooking: allowedPages.filter(
      (p) =>
        ![
          '/ev-loans',
          '/gq-fsf-loans',
          '/gq-non-fsf-loans',
          '/adikosh-loans',
          '/wctl-blloans',
          '/wctl-ccod',
          '/circlepe-loans',
          '/elysium-loans',
          '/business-loans',
          '/embifi-loans',
          '/emiclub-loans',
          '/finso-loans',
          '/hey-ev-loans',
          '/hey-ev-battery-loans', /////sajag
          '/helium-loans',
          '/dealer-onboarding',
         // '/health-care-loans',
          '/aldun-loans',
          '/mis-reports',
        ].some(prefix => p.path.includes(prefix))
    ),
    'Malhotra EV Loans': allowedPages.filter(p => p.path.includes('/ev-loans')),
    //'Health Care Loans': allowedPages.filter(p => p.path.includes('/health-care-loans')),
    'Unsecured BL': allowedPages.filter(p => p.path.includes('/business-loans')),
    'WCTL Business Loans': allowedPages.filter(p => p.path.includes('/wctl-blloans')),
    'WCTL CCOD Loans': allowedPages.filter(p => p.path.includes('/wctl-ccod')),
    'GQ FSF Loans': allowedPages.filter(p => p.path.includes('/gq-fsf-loans')),
    'GQ Non-FSF Loans': allowedPages.filter(p => p.path.includes('/gq-non-fsf-loans')),
    'Embifi Loans': allowedPages.filter(p => p.path.includes('/embifi-loans')),
    'Adikosh Loans': allowedPages.filter(p => p.path.includes('/adikosh-loans')),
    'CirclePe Loans': allowedPages.filter(p => p.path.includes('/circlepe-loans')),
    'Elysium Loans': allowedPages.filter(p => p.path.includes('/elysium-loans')),
    'EMI Club Loans': allowedPages.filter(p => p.path.includes('/emiclub-loans')),
    'Finso Loans': allowedPages.filter(p => p.path.includes('/finso-loans')),
    'HEY EV Loans': allowedPages.filter(p => p.path.includes('/hey-ev-loans')),
    'HEY EV Battery Loans': allowedPages.filter(p => p.path.includes('/hey-ev-battery-loans')),
    'Helium Loans': allowedPages.filter(p => p.path.includes('/helium-loans')),
    'Dealer ALL': allowedPages.filter(p => p.path.includes('/dealer-onboarding')),
    'Aldun Loans': allowedPages.filter(p => p.path.includes('/aldun-loans')),
    'MIS Reports': allowedPages.filter(p => p.path.includes('/mis-reports')),
  };

  const toggleGroup = (group) => {
    setExpanded(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <aside className="sidebar">
      <ul className="sidebar-menu">
        {Object.entries(grouped).map(([group, pages]) =>
          pages.length > 0 ? (
            <li key={group} className="sidebar-group">
              <div
                className="sidebar-group-title"
                onClick={() => toggleGroup(group)}
              >
                {group} {expanded[group] ? '▾' : '▸'}
              </div>
              {expanded[group] && (
                <ul className="sidebar-submenu">
                  {pages.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={p.path}
                        className={
                          location.pathname === p.path ? 'active' : ''
                        }
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ) : null
        )}
      </ul>
    </aside>
  );
};

export default Sidebar;
