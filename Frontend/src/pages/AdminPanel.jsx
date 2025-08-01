import React, { useState, useEffect } from 'react';
import api from '../api/api';
import "../styles/AdminPanel.css";

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

  // Load all users and pages on mount
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

    // Load this user’s current permissions:
    const res = await api.get(`/admin/user-pages/${userId}`);
    const allowedIds = res.data.map((p) => p.id);
    setSelectedPageIds(allowedIds);
  };

  const togglePage = (pageId) => {
    if (selectedPageIds.includes(pageId)) {
      setSelectedPageIds(selectedPageIds.filter((id) => id !== pageId));
    } else {
      setSelectedPageIds([...selectedPageIds, pageId]);
    }
  };

  const handleUpdatePermissions = async () => {
    await api.post('/admin/update-permissions', {
      userId: selectedUserId,
      pageIds: selectedPageIds,
    });
    alert('✅ Permissions updated!');
  };

  return (
  <div className="admin-panel">
    <h2>Admin Panel</h2>

    <section>
      <h3>Create New User</h3>
      <form onSubmit={handleCreateUser}>
        <input
          placeholder="Name"
          value={newUser.name}
          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
          required
        />
        <input
          placeholder="Email"
          type="email"
          value={newUser.email}
          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          required
        />
        <input
          placeholder="Password"
          type="password"
          value={newUser.password}
          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
          required
        />
        <select
          value={newUser.role}
          onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Create User</button>
      </form>
    </section>

    <section>
      <h3>Assign Pages to User</h3>
      <select
        className="user-select"
        value={selectedUserId}
        onChange={handleSelectUser}
      >
        <option value="">Select User</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.email})
          </option>
        ))}
      </select>

      {selectedUserId && (
        <div className="pages-list">
          <p>Allowed Pages:</p>
          {pages.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={selectedPageIds.includes(p.id)}
                onChange={() => togglePage(p.id)}
              />{' '}
              {p.name}
            </label>
          ))}
          <button
            onClick={handleUpdatePermissions}
            className="update-permissions-btn"
          >
            Update Permissions
          </button>
        </div>
      )}
    </section>
  </div>
);

};

export default AdminPanel;
