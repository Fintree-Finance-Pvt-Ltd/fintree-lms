import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/api.js';
import "../styles/Login.css";
import YourImage from '../assets/background_login.jpg';
import logo from "../assets/fintree_logo.png"; 

const Login = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  // Regular login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Forgot password state machine
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState('email'); // 'email' | 'otp' | 'newpass'
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setMessage('✅ OTP sent to your email. Check your inbox/spam.');
      setForgotStep('otp');
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api.post('/auth/verify-otp', { email: forgotEmail, otp });
      setMessage('✅ OTP verified! Set your new password.');
      setForgotStep('newpass');
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.message || 'Invalid OTP'}`);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    setMessage('');
    try {
      await api.post('/auth/reset-password', { 
        email: forgotEmail, 
        otp, 
        newPassword 
      });
      setMessage('✅ Password reset successful! You can now login.');
      setTimeout(() => {
        setShowForgot(false);
        setForgotStep('email');
        setForgotEmail('');
        setOtp('');
        setNewPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.message || err.message}`);
    }
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotStep('email');
    setForgotEmail('');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage('');
  };

  return (
    <div className="login-page" style={{ backgroundImage: `url(${YourImage})` }}>
      <div className="login-card">
        <img src={logo} alt="Fintree Logo" className="logo" />
        
        {/* Regular Login Form */}
        {!showForgot && (
          <>
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
              {error && <p className="error">{error}</p>}
              <button type="submit">Login</button>
            </form>
            <button className="forgot-link" onClick={() => setShowForgot(true)}>
              Forgot Password?
            </button>
          </>
        )}

        {/* Forgot Password Flow */}
        {showForgot && (
          <div className="forgot-container">
            <button className="close-btn" onClick={closeForgot}>×</button>
            <h3>Reset Password</h3>

            {forgotStep === 'email' && (
              <>
                <p>Enter your email to receive OTP</p>
                <form onSubmit={handleSendOtp}>
                  <input
                    type="email"
                    value={forgotEmail}
                    placeholder="Enter email"
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                  <button type="submit">Send OTP</button>
                </form>
              </>
            )}

            {forgotStep === 'otp' && (
              <>
                <p>Enter OTP from email</p>
                <form onSubmit={handleVerifyOtp}>
                  <input
                    type="text"
                    value={otp}
                    placeholder="Enter 6-digit OTP"
                    maxLength="6"
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                  <button type="submit">Verify OTP</button>
                </form>
              </>
            )}

            {forgotStep === 'newpass' && (
              <>
                <p>Set new password</p>
                <form onSubmit={handleResetPassword}>
                  <input
                    type="password"
                    value={newPassword}
                    placeholder="New password (min 6 chars)"
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    placeholder="Confirm new password"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button type="submit">Reset Password</button>
                </form>
              </>
            )}

            {message && <p className={message.startsWith('✅') ? 'success' : 'error'}>{message}</p>}
          </div>
        )}
      </div>

      <style jsx>{`
        .forgot-link {
          background: none;
          border: none;
          color: #4f46e5;
          cursor: pointer;
          font-size: 14px;
          margin-top: 10px;
        }
        .forgot-link:hover {
          text-decoration: underline;
        }
        .forgot-container {
          position: relative;
        }
        .close-btn {
          position: absolute;
          top: 5px;
          right: 10px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
        }
        .success {
          color: #10b981;
        }
        .error {
          color: #ef4444;
        }
      `}</style>
    </div>
  );
};

export default Login;

