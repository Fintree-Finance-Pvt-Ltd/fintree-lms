import React, { useState, useEffect } from 'react';
import './SupplyChainSidebar.css';

const supplyChains = [
  {
    key: 'fintree',
    label: 'Fintree',
    menu: [
      'Loan Details',
      'Invoice Details',
      'Disbursement Details',
      'RPS / Schedule',
      'Cashflow',
      'Extra Charges',
      'Allocation',
      'Documents',
      'Actions',
    ],
  },
  {
    key: 'kite',
    label: 'Kite',
    menu: [
      'Loan Details',
      'Invoice Details',
      'Disbursement Details',
      'RPS / Schedule',
      'Cashflow',
      'Extra Charges',
      'Allocation',
      'Documents',
      'Actions',
    ],
  },
  {
    key: 'muthoot',
    label: 'Muthoot',
    menu: [
      'Loan Details',
      'Invoice Details',
      'Disbursement Details',
      'RPS / Schedule',
      'Cashflow',
      'Extra Charges',
      'Allocation',
      'Documents',
      'Actions',
    ],
  },
];

const SupplyChainSidebar = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedChain, setSelectedChain] = useState(
    localStorage.getItem('selectedChain') || null
  );
  const [activeMenu, setActiveMenu] = useState(
    localStorage.getItem('activeMenu') || null
  );

  useEffect(() => {
    if (selectedChain) localStorage.setItem('selectedChain', selectedChain);
  }, [selectedChain]);

  useEffect(() => {
    if (activeMenu) localStorage.setItem('activeMenu', activeMenu);
  }, [activeMenu]);

  const handleChainClick = (key) => {
    setSelectedChain(key);
    setDropdownOpen(false);
    setActiveMenu(null);
  };

  const handleMenuClick = (item) => {
    setActiveMenu(item);
    // TODO: Route to the corresponding content
  };

  const selectedChainObj = supplyChains.find((c) => c.key === selectedChain);

  return (
    <aside className="supplychain-sidebar">
      <div className="sidebar-title">Supply Chain</div>
      <div
        className={`dropdown ${dropdownOpen ? 'open' : ''}`}
        tabIndex={0}
        onClick={() => setDropdownOpen((open) => !open)}
        onBlur={() => setDropdownOpen(false)}
      >
        <div className="dropdown-label">
          {selectedChainObj ? selectedChainObj.label : 'Select Supply Chain'}
          <span className="dropdown-arrow">▼</span>
        </div>
        <ul className="dropdown-menu">
          {supplyChains.map((chain) => (
            <li
              key={chain.key}
              className={
                selectedChain === chain.key ? 'dropdown-item active' : 'dropdown-item'
              }
              onClick={() => handleChainClick(chain.key)}
            >
              {chain.label}
            </li>
          ))}
        </ul>
      </div>
      {selectedChainObj && (
        <nav className="sidebar-menu">
          <ul>
            {selectedChainObj.menu.map((item) => (
              <li
                key={item}
                className={activeMenu === item ? 'menu-item active' : 'menu-item'}
                onClick={() => handleMenuClick(item)}
                tabIndex={0}
              >
                {/* Optional: Add icon here */}
                {item}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
};

export default SupplyChainSidebar;
