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
      background: '#f6f7fb',
      padding: '32px 16px',
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Helvetica Neue",Arial',
      color: '#1f2937',
    },
    panel: {
      maxWidth: 960,
      margin: '0 auto',
      background: '#fff',
      borderRadius: 14,
      boxShadow: '0 10px 30px rgba(16,24,40,0.08)',
      padding: 24,
    },
    h2: { margin: 0, marginBottom: 16, fontSize: 24, fontWeight: 800 },
    section: {
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 16,
      marginBottom: 18,
      background: '#ffffff',
    },
    h3: { margin: 0, marginBottom: 12, fontSize: 18, fontWeight: 700, color: '#111827' },
    form: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid #d1d5db',
      background: '#fff',
      fontSize: 14,
      outline: 'none',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04) inset',
    },
    select: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid #d1d5db',
      background: '#fff',
      fontSize: 14,
      outline: 'none',
    },
    btn: {
      padding: '10px 14px',
      borderRadius: 10,
      border: '1px solid transparent',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 600,
      transition: 'transform .02s ease-out',
      userSelect: 'none',
    },
    btnPrimary: { background: '#2563eb', color: '#fff', borderColor: '#1d4ed8' },
    btnGhost: { background: '#fff', color: '#1f2937', borderColor: '#d1d5db' },
    btnSuccess: { background: '#10b981', color: '#fff', borderColor: '#059669' },
    full: { gridColumn: '1 / -1' },
    row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    userSelect: { width: 320, padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' },
    pagesList: {
      marginTop: 12,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 10,
    },
    pageLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      borderRadius: 10,
      border: '1px solid #e5e7eb',
      background: '#fafafa',
    },
    actionsBar: { marginTop: 12, display: 'flex', justifyContent: 'flex-end' },
    muted: { color: '#6b7280', fontSize: 14 },
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
