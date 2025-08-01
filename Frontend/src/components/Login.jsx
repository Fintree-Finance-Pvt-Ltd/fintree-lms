import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
// import Auth from '../context/AuthContext.jsx';
import { AuthContext } from '../context/AuthContext';
import "../styles/Login.css";
import YourImage from '../assets/background_login.jpg';
import logo from "../assets/fintree_logo.png"; 

const Login = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard'); // ✅ go to dashboard after login
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <div
      className="login-page"
      style={{ backgroundImage: `url(${YourImage})` }}
    >
      <div className="login-card">
        <img src={logo} alt="Fintree Logo" className="logo" />
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            value={email}
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            value={password}
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p>{error}</p>}
          <button type="submit">Login</button>
        </form>
        {/* <span className="small-link">Forgot Password?</span>
        <span className="small-link">Create Account</span> */}
      </div>
    </div>
  );
};

export default Login;