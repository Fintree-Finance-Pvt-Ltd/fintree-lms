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
    wrap: {
      minHeight: '100vh',
      background: 'var(--bg-page)',
      padding: '40px 24px',
      color: 'var(--text-primary)',
    },
    panel: {
      maxWidth: 960,
      margin: '0 auto',
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-lg)',
      border: '1px solid var(--border)',
      padding: 32,
    },
    h2: { margin: 0, marginBottom: 24, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
    section: {
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: 24,
      marginBottom: 24,
      background: 'var(--bg-card)',
    },
    h3: { margin: 0, marginBottom: 20, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '2px solid var(--primary)', paddingBottom: '10px' },
    form: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
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
      transition: 'var(--transition)'
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
      padding: '12px 24px',
      borderRadius: 'var(--radius-pill)',
      border: 'none',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 600,
      transition: 'var(--transition)',
      userSelect: 'none',
      fontFamily: 'Inter, sans-serif'
    },
    btnPrimary: { background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', boxShadow: '0 4px 12px var(--primary-ring)' },
    btnGhost: { background: '#fff', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    btnSuccess: { background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', boxShadow: '0 4px 12px var(--primary-ring)' }, // Changed to primary red theme for consistency
    full: { gridColumn: '1 / -1' },
    row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    userSelect: { width: 320, padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--bg-input)' },
    pagesList: {
      marginTop: 20,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 12,
    },
    pageLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      background: '#fafafa',
      cursor: 'pointer',
      fontSize: '14px',
      color: 'var(--text-secondary)',
      transition: 'var(--transition)'
    },
    actionsBar: { marginTop: 24, display: 'flex', justifyContent: 'flex-end' },
    muted: { color: 'var(--text-muted)', fontSize: 13 },
  };

  const press = (e) => (e.currentTarget.style.transform = 'translateY(1px)');
  const release = (e) => (e.currentTarget.style.transform = 'translateY(0)');

  return (
    <div style={styles.wrap}>
      <div style={styles.panel}>
        <h2 style={styles.h2}>Admin Panel</h2>

        {/* Create New User */}
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

            <div style={{ ...styles.full, display: 'flex', justifyContent: 'flex-end' }}>
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

        {/* Assign Pages */}
        <section style={styles.section}>
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
            {!selectedUserId && <span style={styles.muted}>Choose a user to edit permissions</span>}
          </div>

          {selectedUserId && (
            <>
              <div style={styles.pagesList}>
                {pages.map((p) => (
                  <label key={p.id} style={styles.pageLabel}>
                    <input
                      type="checkbox"
                      checked={selectedPageIds.includes(p.id)}
                      onChange={() => togglePage(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
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
};

export default AdminPanel;
