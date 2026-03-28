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
          '/zypay-loans',
          '/finso-loans',
          '/hey-ev-loans',
          '/hey-ev-battery-loans', /////sajag
          '/helium-loans',
          '/dealer-onboarding',
          '/supply-chain-loans', // New prefix for Supply Chain Loans
          '/clayoo-loans',
          '/loan-digit',
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
    'Zypay Loans': allowedPages.filter(p => p.path.includes('/zypay-loans')),
    'Finso Loans': allowedPages.filter(p => p.path.includes('/finso-loans')),
    'HEY EV Loans': allowedPages.filter(p => p.path.includes('/hey-ev-loans')),
    'HEY EV Battery Loans': allowedPages.filter(p => p.path.includes('/hey-ev-battery-loans')),
    'Helium Loans': allowedPages.filter(p => p.path.includes('/helium-loans')),
    'Clayoo Loans': allowedPages.filter(p => p.path.includes('/clayoo-loans')), // ✅ NEW
    'Loan Digit': allowedPages.filter(p => p.path.includes('/loan-digit/cases')), // ✅ NEW
    'Supply Chain Loans': allowedPages.filter(p => p.path.includes('/supply-chain-loans')), // New group for Supply Chain Loans
    'Dealer ALL': allowedPages.filter(p => p.path.includes('/dealer-onboarding')),
    'Aldun Loans': allowedPages.filter(p => p.path.includes('/aldun-loans')),
    'MIS Reports': allowedPages.filter(p => p.path.includes('/mis-reports')),
  };

  // const toggleGroup = (group) => {
  //   setExpanded(prev => ({ ...prev, [group]: !prev[group] }));
  // };

  const toggleGroup = (group) => {
  setExpanded(prev => ({
    [group]: !prev[group], // toggle selected group
  }));
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
