import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import logo from "../assets/logo-image.png"; // Adjust the path as necessary

const Navbar = () => {
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);
    console.log("user", user);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem('user'); 
        navigate("/");
    };

     return (
        <div className="navbar">
             <div style={{ display: "flex", alignItems: "center" }}>
                <img 
                    src={logo} 
                    alt="NobleFin Logo" 
                    style={{
                        width: "160px",
                        height: "auto",
                        marginRight: "10px"
                    }}
                />
            </div>

            <div className="welcome">
                {user ? (
                    <span>Welcome, <strong>{user.name}</strong>!</span>
                ) : (
                    <span>Welcome!</span>
                )}
            </div>

            <button onClick={handleLogout} className="logout-btn">
                Logout
            </button>
        </div>
    );
};

export default Navbar;
