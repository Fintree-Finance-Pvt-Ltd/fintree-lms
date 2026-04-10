// // import React, { useState, useContext } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // // import Auth from '../context/AuthContext.jsx';
// // import { AuthContext } from '../context/AuthContext';
// // import api from '../api/api.js';
// // import "../styles/Login.css";
// // import YourImage from '../assets/background_login.jpg';
// // import logo from "../assets/fintree_logo.png"; 

// // const Login = () => {
// //   const { login } = useContext(AuthContext);
// //   const navigate = useNavigate();

// //   // Regular login state
// //   const [email, setEmail] = useState('');
// //   const [password, setPassword] = useState('');
// //   const [error, setError] = useState('');

// //   // Forgot password state machine
// //   const [showForgot, setShowForgot] = useState(false);
// //   const [forgotStep, setForgotStep] = useState('email'); // 'email' | 'otp' | 'newpass'
// //   const [forgotEmail, setForgotEmail] = useState('');
// //   const [otp, setOtp] = useState('');
// //   const [newPassword, setNewPassword] = useState('');
// //   const [confirmPassword, setConfirmPassword] = useState('');
// //   const [message, setMessage] = useState('');

// //   const handleLogin = async (e) => {
// //     e.preventDefault();
// //     setError('');
// //     try {
// //       await login(email, password);
// //       navigate('/dashboard');
// //     } catch (err) {
// //       setError('Invalid email or password');
// //     }
// //   };

// //   const handleSendOtp = async (e) => {
// //     e.preventDefault();
// //     setMessage('');
// //     try {
// //       await api.post('/auth/forgot-password', { email: forgotEmail });
// //       setMessage('✅ OTP sent to your email. Check your inbox/spam.');
// //       setForgotStep('otp');
// //     } catch (err) {
// //       setMessage(`Error: ${err.response?.data?.message || err.message}`);
// //     }
// //   };

// //   const handleVerifyOtp = async (e) => {
// //     e.preventDefault();
// //     setMessage('');
// //     try {
// //       await api.post('/auth/verify-otp', { email: forgotEmail, otp });
// //       setMessage('✅ OTP verified! Set your new password.');
// //       setForgotStep('newpass');
// //     } catch (err) {
// //       setMessage(`Error: ${err.response?.data?.message || 'Invalid OTP'}`);
// //     }
// //   };

// //   const handleResetPassword = async (e) => {
// //     e.preventDefault();
// //     if (newPassword !== confirmPassword) {
// //       setMessage('Passwords do not match');
// //       return;
// //     }
// //     setMessage('');
// //     try {
// //       await api.post('/auth/reset-password', { 
// //         email: forgotEmail, 
// //         otp, 
// //         newPassword 
// //       });
// //       setMessage('✅ Password reset successful! You can now login.');
// //       setTimeout(() => {
// //         setShowForgot(false);
// //         setForgotStep('email');
// //         setForgotEmail('');
// //         setOtp('');
// //         setNewPassword('');
// //         setConfirmPassword('');
// //       }, 2000);
// //     } catch (err) {
// //       setMessage(`Error: ${err.response?.data?.message || err.message}`);
// //     }
// //   };

// //   const closeForgot = () => {
// //     setShowForgot(false);
// //     setForgotStep('email');
// //     setForgotEmail('');
// //     setOtp('');
// //     setNewPassword('');
// //     setConfirmPassword('');
// //     setMessage('');
// //   };

// //   return (
// //     <div className="login-page" style={{ backgroundImage: `url(${YourImage})` }}>
// //       <div className="login-card">
// //         <img src={logo} alt="Fintree Logo" className="logo" />
        
// //         {/* Regular Login Form */}
// //         {!showForgot && (
// //           <>
// //             <h2>Login</h2>
// //             <form onSubmit={handleLogin}>
// //               <input
// //                 type="email"
// //                 value={email}
// //                 placeholder="Email"
// //                 onChange={(e) => setEmail(e.target.value)}
// //                 required
// //               />
// //               <input
// //                 type="password"
// //                 value={password}
// //                 placeholder="Password"
// //                 onChange={(e) => setPassword(e.target.value)}
// //                 required
// //               />
// //               {error && <p className="error">{error}</p>}
// //               <button type="submit">Login</button>
// //             </form>
// //             <button 
// //               type="button" 
// //               className="forgot-link" 
// //               onClick={() => setShowForgot(true)}
// //             >
// //               Forgot Password?
// //             </button>
// //           </>
// //         )}

// //         {/* Forgot Password Flow */}
// //         {showForgot && (
// //           <div className="forgot-container">
// //             <button className="close-btn" onClick={closeForgot}>×</button>
// //             <h3>Reset Password</h3>

// //             {forgotStep === 'email' && (
// //               <>
// //                 <p>Enter your email to receive OTP</p>
// //                 <form onSubmit={handleSendOtp}>
// //                   <input
// //                     type="email"
// //                     value={forgotEmail}
// //                     placeholder="Enter email"
// //                     onChange={(e) => setForgotEmail(e.target.value)}
// //                     required
// //                   />
// //                   <button type="submit">Send OTP</button>
// //                 </form>
// //               </>
// //             )}

// //             {forgotStep === 'otp' && (
// //               <>
// //                 <p>Enter OTP from email</p>
// //                 <form onSubmit={handleVerifyOtp}>
// //                   <input
// //                     type="text"
// //                     value={otp}
// //                     placeholder="Enter 6-digit OTP"
// //                     maxLength="6"
// //                     onChange={(e) => setOtp(e.target.value)}
// //                     required
// //                   />
// //                   <button type="submit">Verify OTP</button>
// //                 </form>
// //               </>
// //             )}

// //             {forgotStep === 'newpass' && (
// //               <>
// //                 <p>Set new password</p>
// //                 <form onSubmit={handleResetPassword}>
// //                   <input
// //                     type="password"
// //                     value={newPassword}
// //                     placeholder="New password (min 6 chars)"
// //                     onChange={(e) => setNewPassword(e.target.value)}
// //                     required
// //                   />
// //                   <input
// //                     type="password"
// //                     value={confirmPassword}
// //                     placeholder="Confirm new password"
// //                     onChange={(e) => setConfirmPassword(e.target.value)}
// //                     required
// //                   />
// //                   <button type="submit">Reset Password</button>
// //                 </form>
// //               </>
// //             )}

// //             {message && <p className={message.startsWith('✅') ? 'success-msg' : 'error-msg'}>{message}</p>}
// //           </div>
// //         )}

// //         <style jsx>{`
// //           .forgot-link {
// //             background: none !important;
// //             border: none !important;
// //             color: #4f46e5;
// //             cursor: pointer;
// //             font-size: 14px;
// //             margin-top: 10px;
// //             width: 100%;
// //             text-align: left;
// //             padding: 0;
// //           }
// //           .forgot-link:hover {
// //             text-decoration: underline;
// //           }
// //           .forgot-container {
// //             position: relative;
// //           }
// //           .close-btn {
// //   position: absolute;
// //   top: 5px;
// //   right: 10px;

// //   background: transparent;
// //   border: none;

// //   font-size: 20px;
// //   cursor: pointer;
// //   color: #666;

// //   /* 🔥 Important fixes */
// //   width: fit-content !important;
// //   padding: 0 !important;
// //   margin: 0 !important;
// //   display: inline-block !important;
// // }
// //           .success-msg {
// //             color: #10b981;
// //             margin-top: 10px;
// //           }
// //           .error-msg {
// //             color: #ef4444;
// //             margin-top: 10px;
// //           }
// //         `}</style>
// //       </div>
// //     </div>
// //   );
// // };

// // export default Login;

// import React, { useState, useContext } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { AuthContext } from '../context/AuthContext';
// import api from '../api/api.js';
// import YourImage from '../assets/background_login.jpg';
// import logo from "../assets/fintree_logo.png";
// import "../styles/Login.css";

// const Login = () => {
//   const { login } = useContext(AuthContext);
//   const navigate = useNavigate();

//   // Regular login state
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [error, setError] = useState('');

//   // Forgot password state machine
//   const [showForgot, setShowForgot] = useState(false);
//   const [forgotStep, setForgotStep] = useState('email');
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

//         {/* Regular Login */}
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
//               {error && <p className="error-msg">{error}</p>}
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

//             {message && (
//               <p className={message.startsWith('✅') ? 'success-msg' : 'error-msg'}>
//                 {message}
//               </p>
//             )}
//           </div>
//         )}

//       </div>
//     </div>
//   );
// };

// export default Login;



import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/api.js';
import logo from "../assets/logo-removebg-preview.png";
import "../styles/Login.css";
import { toast } from "react-toastify";
 
const Login = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
 
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
 
  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
 
  // LOGIN
const handleLogin = async (e) => {
  e.preventDefault();
 
  try {
    await login(email, password);
 
    toast.success("Login successful ");
 
    setTimeout(() => {
      navigate("/dashboard");
    }, 1000);
 
  } catch {
    toast.error("Invalid email or password ");
  }
};
 
  // SEND OTP
const handleSendOtp = async (e) => {
  e.preventDefault();
 
  if (!forgotEmail) {
    return toast.warning("Please enter email ");
  }
 
  try {
    await api.post('/auth/forgot-password', { email: forgotEmail });
 
    toast.success("OTP sent successfully ");
    setForgotStep('otp');
 
  } catch (err) {
    toast.error(err.response?.data?.message || "Failed to send OTP ");
  }
};
  // VERIFY OTP
const handleVerifyOtp = async (e) => {
  e.preventDefault();
 
  if (!otp) {
    return toast.warning("Enter OTP ");
  }
 
  try {
    await api.post('/auth/verify-otp', { email: forgotEmail, otp });
 
    toast.success("OTP verified ");
    setForgotStep('newpass');
 
  } catch {
    toast.error("Invalid OTP ");
  }
};
 
  // RESET PASSWORD
  // const handleResetPassword = async (e) => {
  //   e.preventDefault();
 
  //   if (newPassword !== confirmPassword) {
  //      toast.error('Passwords do not match');
  //     return;
  //   }
 
  //   try {
  //     await api.post('/auth/reset-password', {
  //       email: forgotEmail,
  //       otp,
  //       newPassword
  //     });
 
  //     toast.success('✅ Password reset successful');
 
  //     setTimeout(() => {
  //       setShowForgot(false);
  //       setForgotStep('email');
  //       setForgotEmail('');
  //       setOtp('');
  //       setNewPassword('');
  //       setConfirmPassword('');
  //     }, 2000);
 
  //   } catch (err) {
  //      toast.error(err.response?.data?.message || 'Error resetting password');
  //   }
  // };
 
 
  const handleResetPassword = async (e) => {
  e.preventDefault();
 
  if (!newPassword || !confirmPassword) {
    return toast.warning("Fill all fields ");
  }
 
  if (newPassword !== confirmPassword) {
    return toast.error("Passwords do not match ");
  }
 
  try {
    await api.post('/auth/reset-password', {
      email: forgotEmail,
      otp,
      newPassword
    });
 
    toast.success("Password reset successful ");
 
    setTimeout(() => {
      closeForgot();
    }, 1500);
 
  } catch (err) {
    toast.error(err.response?.data?.message || "Reset failed ");
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
    <div className="login-page">
      <div className="login-card">
 
        <img src={logo} alt="Logo" className="logo" />
 
        {/* LOGIN */}
        {!showForgot && (
          <>
            <h2>Login</h2>
 
            <form onSubmit={handleLogin}>
 
              <div className="inputContainer">
                <input
                  type="email"
                  className="inputField"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
 
              <div className="inputContainer">
                <input
                  type="password"
                  className="inputField"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
 
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
{/* ─────────────────────────────────────────────
   FORGOT PASSWORD
───────────────────────────────────────────── */}
{showForgot && (
  <div className="forgot-container">
 
    {/* ✨ ICON CLOSE (NO BUTTON STYLE) */}
    <span className="close-icon" onClick={closeForgot}>
      ✕
    </span>
 
    <h3>Reset Password</h3>
 
    {/* STEP 1: EMAIL */}
    {forgotStep === "email" && (
      <form onSubmit={handleSendOtp} className="forgot-form">
        <p className="forgot-subtext">Enter your registered email</p>
 
        <div className="inputContainer">
          <input
            type="email"
            className="inputField"
            placeholder="Email address"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            required
          />
        </div>
 
        <button type="submit" className="otp-btn">
          Send OTP
        </button>
      </form>
    )}
 
    {/* STEP 2: OTP */}
    {forgotStep === "otp" && (
      <form onSubmit={handleVerifyOtp} className="forgot-form">
        <p className="forgot-subtext">Enter OTP sent to your email</p>
 
        <div className="inputContainer">
          <input
            type="text"
            className="inputField"
            placeholder="6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength="6"
            required
          />
        </div>
 
        <button type="submit" className="otp-btn">
          Verify OTP
        </button>
      </form>
    )}
 
    {/* STEP 3: RESET PASSWORD */}
    {forgotStep === "newpass" && (
      <form onSubmit={handleResetPassword} className="forgot-form">
        <p className="forgot-subtext">Create a new password</p>
 
        <div className="inputContainer">
          <input
            type="password"
            className="inputField"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
 
        <div className="inputContainer">
          <input
            type="password"
            className="inputField"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
 
        <button type="submit" className="otp-btn">
          Reset Password
        </button>
      </form>
    )}
 
    {/* MESSAGE */}
    {message && (
      <p className={message.startsWith("✅") ? "success-msg" : "error-msg"}>
        {message}
      </p>
    )}
  </div>
)}
 
      </div>
    </div>
  );
};
 
export default Login;
 