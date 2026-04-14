import React, { useState, useEffect } from 'react';
import api from '../api/api';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [pages, setPages] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPageIds, setSelectedPageIds] = useState([]);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
  });

  useEffect(() => {
    fetchUsers();
    fetchPages();
  }, []);

  const fetchUsers = async () => {
    const res = await api.get('/admin/users');
    setUsers(res.data);
  };

  const fetchPages = async () => {
    const res = await api.get('/admin/pages');
    setPages(res.data);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    await api.post('/admin/create-user', newUser);
    alert('✅ New user created!');
    setNewUser({ name: '', email: '', password: '', role: 'user' });
    fetchUsers();
  };

  const handleSelectUser = async (e) => {
    const userId = e.target.value;
    setSelectedUserId(userId);
    if (!userId) {
      setSelectedPageIds([]);
      return;
    }
    const res = await api.get(`/admin/user-pages/${userId}`);
    const allowedIds = res.data.map((p) => p.id);
    setSelectedPageIds(allowedIds);
  };

  const togglePage = (pageId) => {
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  const handleUpdatePermissions = async () => {
    await api.post('/admin/update-permissions', {
      userId: selectedUserId,
      pageIds: selectedPageIds,
    });
    alert('✅ Permissions updated!');
  };

  // -------- inline styles --------
  const styles = {
summaryBar: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginTop: 18,
  marginBottom: 18,
  flexWrap: "wrap",
},

toggleGroup: {
  display: "inline-flex",
  alignItems: "center",
  padding: 4,
  borderRadius: "999px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  gap: 4,
},

toggleBtn: {
  padding: "8px 14px",
  borderRadius: "999px",
  border: "none",
  background: "transparent",
  color: "#475569",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  transition: "all 0.2s ease",
  fontFamily: "Inter, sans-serif",
},
toggleBtnActive: {
  background: "transparent",
  color: "#02133f",
  border: "1.5px solid #02133f",
  // color: "#0f172a",
  // border: "1.5px solid #2563eb",
  boxShadow: "none",
},
// toggleBtnActive: {
//   background: "linear-gradient(90deg, #0f172a, #1e293b)",
//   color: "#ffffff",
//   boxShadow: "0 4px 10px rgba(15, 23, 42, 0.14)",
// },

dropdownCard: {
  border: "1px solid var(--border)",
  borderRadius: "18px",
  background: "#ffffff",
  overflow: "hidden",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
},

dropdownHeader: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: "16px 18px",
  cursor: "pointer",
  background: "#ffffff",
  flexWrap: "wrap",
},

dropdownTitleWrap: {
  display: "flex",
  alignItems: "center",
  gap: 10,
},

dropdownArrow: {
  fontSize: 13,
  color: "#64748b",
  fontWeight: 600,
},

dropdownTitle: {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "#0f172a",
},

dropdownCount: {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 28,
  height: 28,
  padding: "0 8px",
  borderRadius: "999px",
  background: "#f1f5f9",
  color: "#2563eb",
  fontSize: 12,
  fontWeight: 600,
},

dropdownBody: {
  padding: "0 18px 18px",
  borderTop: "1px solid #edf2f7",
  background: "#fbfdff",
},

pageLabelActive: {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
},

//     toggleGroup: {
//   display: "inline-flex",
//   alignItems: "center",
//   padding: 4,
//   borderRadius: "999px",
//   background: "#f8fafc",
//   border: "1px solid #e2e8f0",
//   gap: 4,
// },
toggleGroup: {
  display: "inline-flex",
  alignItems: "center",
  padding: 3,
  borderRadius: "999px",
  background: "#f8fafc",
  border: "1px solid #dbe5f0",
  gap: 3,
},
// toggleBtn: {
//   padding: "8px 14px",
//   borderRadius: "999px",
//   border: "none",
//   background: "transparent",
//   color: "#475569",
//   cursor: "pointer",
//   fontSize: 12,
//   fontWeight: 600,
//   transition: "all 0.2s ease",
//   fontFamily: "Inter, sans-serif",
// },

toggleBtn: {
  padding: "7px 14px",
  borderRadius: "999px",
  border: "1px solid transparent",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  transition: "all 0.2s ease",
  fontFamily: "Inter, sans-serif",
  boxShadow: "none",
},

toggleBtnActive: {
  background: "#eff6ff",
  color: "#02133f",
  border: "1px solid #bfdbfe",
  boxShadow: "none",
},
// toggleBtnActive: {
//     background: "linear-gradient(90deg, #0f172a, #1e293b)",

//   // background: "linear-gradient(90deg, #0f172a, #1e293b)",
//   color: "#ffffff",
//   boxShadow: "0 4px 10px rgba(15, 23, 42, 0.14)",
// },
    // wrap: {
    //   minHeight: '100vh',
    //   background: 'var(--bg-page)',
    //   padding: '40px 24px',
    //   color: 'var(--text-primary)',
    // },
 
    wrap: {
  minHeight: '100vh',
  background: 'var(--bg-page)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '8px 16px 16px 16px',
},
  panel: {
  width: '100%',
  maxWidth: 980,
  margin: '16px auto',
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--shadow-lg)',
  border: '1px solid var(--border)',
  padding: 24,
},
    // panel: {
    //   maxWidth: 960,
    //   margin: '0 auto',
    //   background: 'var(--bg-card)',
    //   borderRadius: 'var(--radius-xl)',
    //   boxShadow: 'var(--shadow-lg)',
    //   border: '1px solid var(--border)',
    //   padding: 32,
    // },
    h2: { margin: 0, marginBottom: 24, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
    // section: {
    //   border: '1px solid var(--border)',
    //   borderRadius: 'var(--radius-lg)',
    //   padding: 24,
    //   marginBottom: 24,
    //   background: 'var(--bg-card)',
    // },
section: {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 20,
  marginBottom: 16,
  background: 'var(--bg-card)',
  transition: 'all 0.25s ease',
},
    // h3: { margin: 0, marginBottom: 20, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '2px solid var(--primary)', paddingBottom: '10px' },
    h3: {
      margin: 0,
      marginBottom: 22,
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--text-primary)',
      borderBottom: '2px solid var(--primary)',
      paddingBottom: '12px'
    },
    // form: {
    //   display: 'grid',
    //   gridTemplateColumns: '1fr 1fr',
    //   gap: 18,
    // },
    form: {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 14,
},
    input: {
      width: '100%',
      padding: '12px 16px',
      borderRadius: 'var(--radius-sm)',
      border: '1.5px solid var(--border)',
      background: 'var(--bg-input)',
      fontSize: 14,
      outline: 'none',
      color: 'var(--text-primary)',
      transition: 'all 0.2s ease'
    },
    select: {
      width: '100%',
      padding: '12px 16px',
      borderRadius: 'var(--radius-sm)',
      border: '1.5px solid var(--border)',
      background: 'var(--bg-input)',
      fontSize: 14,
      outline: 'none',
      color: 'var(--text-primary)',
      transition: 'var(--transition)'
    },
    btn: {
      padding: '14px 32px',
      borderRadius: '999px',
      border: 'none',
      cursor: 'pointer',

      fontSize: 15,
      fontWeight: 600,
      transition: 'var(--transition)',
      userSelect: 'none',
      fontFamily: 'Inter, sans-serif'
    },
    // btn: {
    //   padding: '12px 24px',
    //   borderRadius: 'var(--radius-pill)',
    //   border: 'none',
    //   cursor: 'pointer',
    //   fontSize: 14,
    //   fontWeight: 600,
    //   transition: 'var(--transition)',
    //   userSelect: 'none',
    //   fontFamily: 'Inter, sans-serif'
    // },
    btnPrimary: {
      background: 'linear-gradient(135deg, #0f172a, #1e293b)',
      color: '#fff', boxShadow: '0 4px 12px var(--primary-ring)'
    },
    btnGhost: { background: '#fff', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    // btnSuccess: { background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))'
    //   , color: '#fff', boxShadow: '0 4px 12px var(--primary-ring)' }, // Changed to primary red theme for consistency
  
  btnSuccess: {
  background: 'linear-gradient(135deg, #0f172a, #1e293b)',
  color: '#fff',
  boxShadow: '0 4px 12px var(--primary-ring)'
},
    full: { gridColumn: '1 / -1' },
    row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    userSelect: { width: 320, padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--bg-input)' },
    // pagesList: {
    //   marginTop: 20,
    //   display: 'grid',
    //   gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    //   gap: 12,
    // },
    pagesList: {
  marginTop: 16,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 10,
},

pageLabel: {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: '#fafafa',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'var(--text-secondary)',
  transition: 'all 0.2s ease'
},

categoryCard: {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 18,
  background: "#ffffff",
},

categoryHeader: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
},

categoryTitle: {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text-primary)",
},

smallBtn: {
  padding: "10px 14px",
  borderRadius: "12px",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "var(--transition)",
  userSelect: "none",
  fontFamily: "Inter, sans-serif",
},

    actionsBar: { marginTop: 24, display: 'flex', justifyContent: 'flex-end' },
    muted: { color: 'var(--text-muted)', fontSize: 13 },
  };

  const press = (e) => (e.currentTarget.style.transform = 'translateY(1px)');
  const release = (e) => (e.currentTarget.style.transform = 'translateY(0)');

  const groupedPages = pages.reduce((acc, p) => {
  const name = p.name || "";

  let category = "Other";

  if (name.includes("Excel") || name.includes("Upload") || name.includes("Download")) {
    category = "Uploads & Templates";
  } else if (name.includes("Approved Loans") || name.includes("Disbursed Loans") || name.includes("All Loans") || name.includes("Login Loans") || name.includes("Active Loans")) {
    category = "Loan Pages";
  } else if (name.includes("Dashboard") || name.includes("Report")) {
    category = "Dashboards & Reports";
  } else if (name.includes("Admin")) {
    category = "Administration";
  } else if (name.includes("SOA") || name.includes("RPS") || name.includes("Cashflow") || name.includes("Forecloser") || name.includes("Application Form")) {
    category = "Operations";
  } else if (name.includes("Limits") || name.includes("FLDG")) {
    category = "Limits & Controls";
  }

  if (!acc[category]) acc[category] = [];
  acc[category].push(p);
  return acc;
}, {});

const selectAllPages = () => {
  setSelectedPageIds(pages.map((p) => p.id));
};

const clearAllPages = () => {
  setSelectedPageIds([]);
};

const selectCategoryPages = (categoryPages) => {
  const ids = categoryPages.map((p) => p.id);
  setSelectedPageIds((prev) => Array.from(new Set([...prev, ...ids])));
};

const clearCategoryPages = (categoryPages) => {
  const idsToRemove = new Set(categoryPages.map((p) => p.id));
  setSelectedPageIds((prev) => prev.filter((id) => !idsToRemove.has(id)));
};
const [openCategories, setOpenCategories] = useState({});

const toggleCategory = (category) => {
  setOpenCategories((prev) => ({
    ...prev,
    [category]: !prev[category],
  }));
};

return (
  <div style={styles.wrap}>
    <div style={styles.panel}>
      <h2 style={styles.h2}>Admin Panel</h2>

      <section style={styles.section}>
        <h3 style={styles.h3}>Create New User</h3>
        <form onSubmit={handleCreateUser} style={styles.form}>
          <input
            placeholder="Name"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            required
            style={styles.input}
          />
          <input
            placeholder="Email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            required
            style={styles.input}
          />
          <input
            placeholder="Password"
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            onFocus={(e) => (e.target.style.boxShadow = "0 0 0 3px var(--primary-ring)")}
            onBlur={(e) => (e.target.style.boxShadow = "none")}
            required
            style={styles.input}
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            style={styles.select}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          <div style={{ ...styles.full, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onMouseDown={press}
              onMouseUp={release}
              onMouseLeave={release}
            >
              Create User
            </button>
          </div>
        </form>
      </section>

      <section
        style={styles.section}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0px)")}
      >
        <h3 style={styles.h3}>Assign Pages to User</h3>

        <div style={styles.row}>
          <select value={selectedUserId} onChange={handleSelectUser} style={styles.userSelect}>
            <option value="">Select User</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          {!selectedUserId && (
            <span style={styles.muted}>Choose a user to edit permissions</span>
          )}
        </div>

        {selectedUserId && (
          <>
            <div style={styles.summaryBar}>
              <div style={styles.muted}>
                Total : <strong>{pages.length}</strong> | Selected:{" "}
                <strong>{selectedPageIds.length}</strong>
              </div>
              <div style={styles.toggleGroup}>
  <button
    type="button"
    onClick={selectAllPages}
    style={{
      ...styles.toggleBtn,
      ...(selectedPageIds.length === pages.length && pages.length > 0
        ? styles.toggleBtnActive
        : {}),
    }}
  >
    Select All
  </button>

  <button
    type="button"
    onClick={clearAllPages}
    style={{
      ...styles.toggleBtn,
      ...(selectedPageIds.length === 0 ? styles.toggleBtnActive : {}),
    }}
  >
    Clear All
  </button>
</div>
{/* 
              <div style={styles.toggleGroup}>
                <button
                  type="button"
                  onClick={selectAllPages}
                  style={{ ...styles.toggleBtn, ...styles.toggleBtnActive }}
                >
                  Select All
                </button>

                <button
                  type="button"
                  onClick={clearAllPages}
                  style={styles.toggleBtn}
                >
                  Clear All
                </button>
              </div> */}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {Object.entries(groupedPages).map(([category, categoryPages]) => {
                const isOpen = !!openCategories[category];

                return (
                  <div key={category} style={styles.dropdownCard}>
                    <div
                      style={styles.dropdownHeader}
                      onClick={() => toggleCategory(category)}
                    >
                      <div style={styles.dropdownTitleWrap}>
                        <span style={styles.dropdownArrow}>
                          {isOpen ? "▾" : "▸"}
                        </span>
                        <h4 style={styles.dropdownTitle}>{category}</h4>
                        <span style={styles.dropdownCount}>
                          {categoryPages.length}
                        </span>
                      </div>
                      </div>
{/* 
<div style={styles.toggleGroup}>
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      selectCategoryPages(categoryPages);
    }}
    style={{
      ...styles.toggleBtn,
      ...(categoryPages.every((p) => selectedPageIds.includes(p.id))
        ? styles.toggleBtnActive
        : {}),
    }}
  >
    Select
  </button>

  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      clearCategoryPages(categoryPages);
    }}
    style={{
      ...styles.toggleBtn,
      ...(categoryPages.every((p) => !selectedPageIds.includes(p.id))
        ? styles.toggleBtnActive
        : {}),
    }}
  >
    Clear
  </button>
</div> */}
                      {/* <div style={styles.toggleGroup}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectCategoryPages(categoryPages);
                          }}
                          style={{ ...styles.toggleBtn, ...styles.toggleBtnActive }}
                        >
                          Select
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearCategoryPages(categoryPages);
                          }}
                          style={styles.toggleBtn}
                        >
                          Clear
                        </button>
                      </div> */}
                    {/* </div> */}
{isOpen && (
  <div style={styles.dropdownBody}>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <div style={styles.toggleGroup}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            selectCategoryPages(categoryPages);
          }}
          style={{
            ...styles.toggleBtn,
            ...(categoryPages.every((p) => selectedPageIds.includes(p.id))
              ? styles.toggleBtnActive
              : {}),
          }}
        >
          Select
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clearCategoryPages(categoryPages);
          }}
          style={{
            ...styles.toggleBtn,
            ...(categoryPages.every((p) => !selectedPageIds.includes(p.id))
              ? styles.toggleBtnActive
              : {}),
          }}
        >
          Clear
        </button>
      </div>
    </div>

    <div style={styles.pagesList}>
      {categoryPages.map((p) => (
        <label
          key={p.id}
          style={{
            ...styles.pageLabel,
            ...(selectedPageIds.includes(p.id)
              ? styles.pageLabelActive
              : {}),
          }}
        >
          <input
            type="checkbox"
            checked={selectedPageIds.includes(p.id)}
            onChange={() => togglePage(p.id)}
          />
          {p.name}
        </label>
      ))}
    </div>
  </div>
)}
                    {/* {isOpen && (
                      <div style={styles.dropdownBody}>
                        <div style={styles.pagesList}>
                          {categoryPages.map((p) => (
                            <label
                              key={p.id}
                              style={{
                                ...styles.pageLabel,
                                ...(selectedPageIds.includes(p.id)
                                  ? styles.pageLabelActive
                                  : {}),
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPageIds.includes(p.id)}
                                onChange={() => togglePage(p.id)}
                              />
                              {p.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )} */}
                  </div>
                );
              })}
            </div>

            <div style={styles.actionsBar}>
              <button
                onClick={handleUpdatePermissions}
                style={{ ...styles.btn, ...styles.btnSuccess }}
                onMouseDown={press}
                onMouseUp={release}
                onMouseLeave={release}
              >
                Update Permissions
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  </div>
);

//   return (
//     <div style={styles.wrap}>
//       <div style={styles.panel}>
//         <h2 style={styles.h2}>Admin Panel</h2>

//         {/* Create New User */}
//         <section style={styles.section}>
//           <h3 style={styles.h3}>Create New User</h3>
//           <form onSubmit={handleCreateUser} style={styles.form}>
//             <input
//               placeholder="Name"
//               value={newUser.name}
//               onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
//               required
//               style={styles.input}
//             />
//             <input
//               placeholder="Email"
//               type="email"
//               value={newUser.email}
//               onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
//               required
//               style={styles.input}
//             />
//             <input
//               placeholder="Password"
//               type="password"
//               value={newUser.password}
//               onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
//               onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'}
//               onBlur={(e) => e.target.style.boxShadow = 'none'}
//               required
//               style={styles.input}
//             />
//             <select
//               value={newUser.role}
//               onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
//               style={styles.select}
//             >
//               <option value="user">User</option>
//               <option value="admin">Admin</option>
//             </select>

//             <div style={{ ...styles.full, display: 'flex', justifyContent: 'flex-end' }}>
//               <button
//                 type="submit"
//                 style={{ ...styles.btn, ...styles.btnPrimary }}
//                 onMouseDown={press}
//                 onMouseUp={release}
//                 onMouseLeave={release}
//               >
//                 Create User
//               </button>
//             </div>
//           </form>
//         </section>

//         {/* Assign Pages */}
//         <section style={styles.section}
//           onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
//           onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0px)'}>
//           <h3 style={styles.h3}>Assign Pages to User</h3>

//           <div style={styles.row}>
//             <select value={selectedUserId} onChange={handleSelectUser} style={styles.userSelect}>
//               <option value="">Select User</option>
//               {users.map((u) => (
//                 <option key={u.id} value={u.id}>
//                   {u.name} ({u.email})
//                 </option>
//               ))}
//             </select>
//             {!selectedUserId && <span style={styles.muted}>Choose a user to edit permissions</span>}
//           </div>

// {selectedUserId && (
//   <>
//     <div style={{ ...styles.row, justifyContent: "space-between", marginTop: 18, marginBottom: 18 }}>
//       <div style={styles.muted}>
//         Total Pages: <strong>{pages.length}</strong> | Selected: <strong>{selectedPageIds.length}</strong>
//       </div>

//       <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
//         <button
//           type="button"
//           onClick={selectAllPages}
//           style={{ ...styles.btn, ...styles.btnPrimary }}
//         >
//           Select All
//         </button>

//         <button
//           type="button"
//           onClick={clearAllPages}
//           style={{ ...styles.btn, ...styles.btnGhost }}
//         >
//           Clear All
//         </button>
//       </div>
//     </div>

//     <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
//       {Object.entries(groupedPages).map(([category, categoryPages]) => (
//         <div key={category} style={styles.categoryCard}>
//           <div style={styles.categoryHeader}>
//             <h4 style={styles.categoryTitle}>{category}</h4>

//             <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
//               <button
//                 type="button"
//                 onClick={() => selectCategoryPages(categoryPages)}
//                 style={{ ...styles.smallBtn, ...styles.btnPrimary }}
//               >
//                 Select Category
//               </button>

//               <button
//                 type="button"
//                 onClick={() => clearCategoryPages(categoryPages)}
//                 style={{ ...styles.smallBtn, ...styles.btnGhost }}
//               >
//                 Clear Category
//               </button>
//             </div>
//           </div>

//           <div style={styles.pagesList}>
//             {categoryPages.map((p) => (
//               <label
//                 key={p.id}
//                 style={styles.pageLabel}
//                 onMouseEnter={(e) =>
//                   (e.currentTarget.style.background = "rgba(15, 23, 42, 0.06)")
//                 }
//                 onMouseLeave={(e) =>
//                   (e.currentTarget.style.background = "#fafafa")
//                 }
//               >
//                 <input
//                   type="checkbox"
//                   checked={selectedPageIds.includes(p.id)}
//                   onChange={() => togglePage(p.id)}
//                 />
//                 {p.name}
//               </label>
//             ))}
//           </div>
//         </div>
//       ))}
//     </div>

//     <div style={styles.actionsBar}>
//       <button
//         onClick={handleUpdatePermissions}
//         style={{ ...styles.btn, ...styles.btnSuccess }}
//         onMouseDown={press}
//         onMouseUp={release}
//         onMouseLeave={release}
//       >
//         Update Permissions
//       </button>
//     </div>
//   </>
// )}

//           {/* {selectedUserId && (
//             <>
//               <div style={styles.pagesList}>
//                 {pages.map((p) => (
//                   <label key={p.id} style={styles.pageLabel}
//                     onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'}
//                     onMouseLeave={(e) => e.currentTarget.style.background = '#fafafa'}>
//                     <input
//                       type="checkbox"
//                       checked={selectedPageIds.includes(p.id)}
//                       onChange={() => togglePage(p.id)}
//                     />
//                     {p.name}
//                   </label>
//                 ))}
//               </div>

//               <div style={styles.actionsBar}>
//                 <button
//                   onClick={handleUpdatePermissions}
//                   style={{ ...styles.btn, ...styles.btnSuccess }}
//                   onMouseDown={press}
//                   onMouseUp={release}
//                   onMouseLeave={release}
//                 >
//                   Update Permissions
//                 </button>
//               </div>
//             </>
//           )} */}
//         </section>
//       </div>
//     </div>
//   );
};

export default AdminPanel;
