// import React, { useState, useContext } from 'react';
// import { useNavigate } from 'react-router-dom';
// // import Auth from '../context/AuthContext.jsx';
// import { AuthContext } from '../context/AuthContext';
// import api from '../api/api.js';
// import "../styles/Login.css";
// import YourImage from '../assets/background_login.jpg';
// import logo from "../assets/fintree_logo.png"; 

// const Login = () => {
//   const { login } = useContext(AuthContext);
//   const navigate = useNavigate();

//   // Regular login state
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [error, setError] = useState('');

//   // Forgot password state machine
//   const [showForgot, setShowForgot] = useState(false);
//   const [forgotStep, setForgotStep] = useState('email'); // 'email' | 'otp' | 'newpass'
//   const [forgotEmail, setForgotEmail] = useState('');
//   const [otp, setOtp] = useState('');
//   const [newPassword, setNewPassword] = useState('');
//   const [confirmPassword, setConfirmPassword] = useState('');
//   const [message, setMessage] = useState('');

//   const handleLogin = async (e) => {
//     e.preventDefault();
//     setError('');
//     try {
//       await login(email, password);
//       navigate('/dashboard');
//     } catch (err) {
//       setError('Invalid email or password');
//     }
//   };

//   const handleSendOtp = async (e) => {
//     e.preventDefault();
//     setMessage('');
//     try {
//       await api.post('/auth/forgot-password', { email: forgotEmail });
//       setMessage('✅ OTP sent to your email. Check your inbox/spam.');
//       setForgotStep('otp');
//     } catch (err) {
//       setMessage(`Error: ${err.response?.data?.message || err.message}`);
//     }
//   };

//   const handleVerifyOtp = async (e) => {
//     e.preventDefault();
//     setMessage('');
//     try {
//       await api.post('/auth/verify-otp', { email: forgotEmail, otp });
//       setMessage('✅ OTP verified! Set your new password.');
//       setForgotStep('newpass');
//     } catch (err) {
//       setMessage(`Error: ${err.response?.data?.message || 'Invalid OTP'}`);
//     }
//   };

//   const handleResetPassword = async (e) => {
//     e.preventDefault();
//     if (newPassword !== confirmPassword) {
//       setMessage('Passwords do not match');
//       return;
//     }
//     setMessage('');
//     try {
//       await api.post('/auth/reset-password', { 
//         email: forgotEmail, 
//         otp, 
//         newPassword 
//       });
//       setMessage('✅ Password reset successful! You can now login.');
//       setTimeout(() => {
//         setShowForgot(false);
//         setForgotStep('email');
//         setForgotEmail('');
//         setOtp('');
//         setNewPassword('');
//         setConfirmPassword('');
//       }, 2000);
//     } catch (err) {
//       setMessage(`Error: ${err.response?.data?.message || err.message}`);
//     }
//   };

//   const closeForgot = () => {
//     setShowForgot(false);
//     setForgotStep('email');
//     setForgotEmail('');
//     setOtp('');
//     setNewPassword('');
//     setConfirmPassword('');
//     setMessage('');
//   };

//   return (
//     <div className="login-page" style={{ backgroundImage: `url(${YourImage})` }}>
//       <div className="login-card">
//         <img src={logo} alt="Fintree Logo" className="logo" />
        
//         {/* Regular Login Form */}
//         {!showForgot && (
//           <>
//             <h2>Login</h2>
//             <form onSubmit={handleLogin}>
//               <input
//                 type="email"
//                 value={email}
//                 placeholder="Email"
//                 onChange={(e) => setEmail(e.target.value)}
//                 required
//               />
//               <input
//                 type="password"
//                 value={password}
//                 placeholder="Password"
//                 onChange={(e) => setPassword(e.target.value)}
//                 required
//               />
//               {error && <p className="error">{error}</p>}
//               <button type="submit">Login</button>
//             </form>
//             <button 
//               type="button" 
//               className="forgot-link" 
//               onClick={() => setShowForgot(true)}
//             >
//               Forgot Password?
//             </button>
//           </>
//         )}

//         {/* Forgot Password Flow */}
//         {showForgot && (
//           <div className="forgot-container">
//             <button className="close-btn" onClick={closeForgot}>×</button>
//             <h3>Reset Password</h3>

//             {forgotStep === 'email' && (
//               <>
//                 <p>Enter your email to receive OTP</p>
//                 <form onSubmit={handleSendOtp}>
//                   <input
//                     type="email"
//                     value={forgotEmail}
//                     placeholder="Enter email"
//                     onChange={(e) => setForgotEmail(e.target.value)}
//                     required
//                   />
//                   <button type="submit">Send OTP</button>
//                 </form>
//               </>
//             )}

//             {forgotStep === 'otp' && (
//               <>
//                 <p>Enter OTP from email</p>
//                 <form onSubmit={handleVerifyOtp}>
//                   <input
//                     type="text"
//                     value={otp}
//                     placeholder="Enter 6-digit OTP"
//                     maxLength="6"
//                     onChange={(e) => setOtp(e.target.value)}
//                     required
//                   />
//                   <button type="submit">Verify OTP</button>
//                 </form>
//               </>
//             )}

//             {forgotStep === 'newpass' && (
//               <>
//                 <p>Set new password</p>
//                 <form onSubmit={handleResetPassword}>
//                   <input
//                     type="password"
//                     value={newPassword}
//                     placeholder="New password (min 6 chars)"
//                     onChange={(e) => setNewPassword(e.target.value)}
//                     required
//                   />
//                   <input
//                     type="password"
//                     value={confirmPassword}
//                     placeholder="Confirm new password"
//                     onChange={(e) => setConfirmPassword(e.target.value)}
//                     required
//                   />
//                   <button type="submit">Reset Password</button>
//                 </form>
//               </>
//             )}

//             {message && <p className={message.startsWith('✅') ? 'success-msg' : 'error-msg'}>{message}</p>}
//           </div>
//         )}

//         <style jsx>{`
//           .forgot-link {
//             background: none !important;
//             border: none !important;
//             color: #4f46e5;
//             cursor: pointer;
//             font-size: 14px;
//             margin-top: 10px;
//             width: 100%;
//             text-align: left;
//             padding: 0;
//           }
//           .forgot-link:hover {
//             text-decoration: underline;
//           }
//           .forgot-container {
//             position: relative;
//           }
//           .close-btn {
//   position: absolute;
//   top: 5px;
//   right: 10px;

//   background: transparent;
//   border: none;

//   font-size: 20px;
//   cursor: pointer;
//   color: #666;

//   /* 🔥 Important fixes */
//   width: fit-content !important;
//   padding: 0 !important;
//   margin: 0 !important;
//   display: inline-block !important;
// }
//           .success-msg {
//             color: #10b981;
//             margin-top: 10px;
//           }
//           .error-msg {
//             color: #ef4444;
//             margin-top: 10px;
//           }
//         `}</style>
//       </div>
//     </div>
//   );
// };

// export default Login;


import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/api.js';
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
  const [forgotStep, setForgotStep] = useState('email');
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

        {/* Regular Login */}
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
              {error && <p className="error-msg">{error}</p>}
              <button type="submit">Login</button>
            </form>

            <button 
              type="button" 
              className="forgot-link" 
              onClick={() => setShowForgot(true)}
            >
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

            {message && (
              <p className={message.startsWith('✅') ? 'success-msg' : 'error-msg'}>
                {message}
              </p>
            )}
          </div>
        )}

        {/* STYLES */}
        <style jsx>{`
          .login-page {
            height: 100vh;
            background-size: cover;
            background-position: center;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .login-card {
            width: 360px;
            padding: 30px 25px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.12);
            backdrop-filter: blur(12px);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
            text-align: center;
          }

          .logo {
            width: 140px;
            margin-bottom: 15px;
          }

          h2, h3 {
            margin-bottom: 10px;
            color: #111;
          }

          p {
            font-size: 14px;
            color: #666;
            margin-bottom: 15px;
          }

          input {
            width: 100%;
            padding: 12px 15px;
            margin-bottom: 15px;
            border-radius: 25px;
            border: none;
            outline: none;
            background: #f3f4f6;
            font-size: 14px;
          }

          input:focus {
            background: #fff;
            box-shadow: 0 0 0 2px #ef4444;
          }

          button {
            width: 100%;
            padding: 12px;
            border-radius: 25px;
            border: none;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            font-weight: 600;
            cursor: pointer;
            transition: 0.3s;
          }

          button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
          }

          .forgot-link {
            background: none !important;
            border: none !important;
            color: #ef4444;
            font-size: 14px;
            margin-top: 10px;
            cursor: pointer;
          }

          .forgot-link:hover {
            text-decoration: underline;
          }

          .forgot-container {
            position: relative;
            margin-top: 10px;
          }

          .close-btn {
            position: absolute;
            top: -10px;
            right: -10px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: #ef4444;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            cursor: pointer;
            border: none;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          }

          .close-btn:hover {
            background: #dc2626;
          }

          .success-msg {
            color: #10b981;
            margin-top: 10px;
            font-size: 13px;
          }

          .error-msg {
            color: #ef4444;
            margin-top: 10px;
            font-size: 13px;
          }
        `}</style>
      </div>
    </div>
  );
};

export default Login;