import { createContext, useState, useEffect } from 'react';
import api from '../api/api';

export const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(undefined);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token } = res.data;

    // Save token
    localStorage.setItem('token', token);


    const meRes = await api.get('/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const userObj = {
      userId: meRes.data.userId,
      role: meRes.data.role,
      name: meRes.data.name,
      pages: meRes.data.pages,
    };

    // ✅ Store user separately
    localStorage.setItem('user', JSON.stringify(userObj));
    setUser(userObj);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user'); // ✅ clear stored user
    setUser(null);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    } else if (token) {
      api
        .get('/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then((res) => {
          const userObj = {
            userId: res.data.userId,    
            role: res.data.role,
            name: res.data.name,
            pages: res.data.pages,
          };
          localStorage.setItem('user', JSON.stringify(userObj));
          setUser(userObj);
        })
        .catch((err) => {
          console.error('❌ Session invalid:', err);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        });
    } else {
      console.log('👉 No token found — skipping /me check');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
