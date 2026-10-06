import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    "X-API-Key": import.meta.env.VITE_PARTNER_API_KEY, 
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    console.log("👉 Attaching token:", token);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auto-logout interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("Token expired or invalid. Auto-logging out...");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // Force reload to the login screen to clear React state completely
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;