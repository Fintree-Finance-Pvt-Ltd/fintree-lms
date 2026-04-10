// import React, { useContext } from "react";
// import { useNavigate } from "react-router-dom";
// import { AuthContext } from "../context/AuthContext";
// import logo from "../assets/logo-removebg-preview.png"; // Adjust the path as necessary

// const Navbar = () => {
//   const navigate = useNavigate();
//   const { user } = useContext(AuthContext);

//   const handleLogout = () => {
//     localStorage.removeItem("token");
//     localStorage.removeItem('user');
//     navigate("/");
//   };

//   //      return (
//   //         <div className="navbar">
//   //              <div style={{ display: "flex", alignItems: "center" }}>
//   //                 <img 
//   //                     src={logo} 
//   //                     alt="fintree_logo" 
//   //                     style={{
//   //                         width: "140px",
//   //                         height: "100px",
//   //                         marginLeft: "10px"
//   //                     }}
//   //                 />
//   //             </div>
//   // <div className="welcome-box">
//   //   {user ? (
//   //     <>
//   //       <span className="wave">👋</span>
//   //       <span className="welcome-text">
//   //         Welcome back to <span className="brand">Fintree LMS</span>
//   //       </span>

//   //       <span className="user-pill">
//   //         {user.name}
//   //       </span>
//   //     </>
//   //   ) : (
//   //     <span className="welcome-text">
//   //       Welcome to <span className="brand">Fintree LMS</span>
//   //     </span>
//   //   )}
//   // </div>
//   //             {/* <div className="welcome">
//   //                 {user ? (
//   //                     <span>Welcome to Fintree LMS, <strong>{user.name}</strong>!</span>
//   //                 ) : (
//   //                     <span>Welcome to Fintree LMS!</span>
//   //                 )}
//   //             </div> */}

//   //             <button onClick={handleLogout} className="logout-btn">
//   //                 Logout  
//   //             </button>
//   //         </div>
//   //     );

//   return (
//     <div className="navbar">

//       {/* LEFT SIDE */}
//       <div className="nav-left">

//         <img
//           src={logo}
//           alt="logo"
//           className="logo"
//         />

//         {/* <div className="divider" /> */}

//         {/* <span className="portal-name">
//         Supply Chain Portal
//       </span> */}

//       </div>


//       {/* RIGHT SIDE */}
//       <div className="nav-right">

//         <div className="profile-box">

//           <div className="profile-avatar">
//             {user?.name?.charAt(0).toUpperCase()}
//           </div>

//           <span className="profile-name">
//             {user?.name}
//           </span>

//           <button
//             className="logout-link"
//             onClick={handleLogout}
//           >
//             Logout
//           </button>

//         </div>

//       </div>

//     </div>
//   );

// };

// export default Navbar;




import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
// 👇 Your logo import
import logo from "../assets/logo-removebg-preview.png";
import '../styles/navbar.css'
 
const Navbar = () => {
    const navigate = useNavigate();
    const { user, logout } = useContext(AuthContext);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };
 
    return (
        <nav className="header-nav">
            <div className="header-left">
           
                <div className="logo-container">
                    <img src={logo} alt="Fintree Logo" className="header-logo" />
                </div>
            </div>
 
            <div className="header-right">
                <div className="profile-container">
                    <div className="user-greeting">
                        <span className="greeting-label">System Active</span>
                        <span className="greeting-name">{user ? user.name : "Guest User"}</span>
                    </div>
                   
                    <div className="header-avatar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
 
                    <div className="header-divider"></div>
 
                    <button onClick={handleLogout} className="header-logout-btn" title="Sign Out">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                        </svg>
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </nav>
    );
};
 
export default Navbar;
 