import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import logo from "../assets/fintree_logo.png"; // Adjust the path as necessary

const Navbar = () => {
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);

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
                    alt="fintree_logo" 
                    style={{
                        width: "140px",
                        height: "60px",
                        marginLeft: "10px"
                    }}
                />
            </div>

            <div className="welcome">
                {user ? (
                    <span>Welcome to Fintree LMS, <strong>{user.name}</strong>!</span>
                ) : (
                    <span>Welcome to Fintree LMS!</span>
                )}
            </div>

            <button onClick={handleLogout} className="logout-btn">
                Logout
            </button>
        </div>
    );
};

export default Navbar;
