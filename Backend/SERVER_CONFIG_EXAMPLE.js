// ============================================
// EXAMPLE: How to integrate dashboardRoutesFast
// ============================================
// 
// Copy the relevant lines from THIS FILE into your actual server.js
//

const express = require('express');
const cors = require('cors');
const compression = require('compression');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(compression()); // Enable compression for all responses

// ============================================
// EXISTING ROUTES (Keep these)
// ============================================
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const loanRoutes = require('./routes/loanRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes'); // Old routes

// Register existing routes
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/dashboard', dashboardRoutes); // Keep this for backward compatibility

// ============================================
// 🆕 ADD THESE 3 LINES FOR FAST DASHBOARD
// ============================================

const dashboardRoutesFast = require('./routes/dashboardRoutesFast');
app.use('/api/dashboard/fast', dashboardRoutesFast);

// ============================================
// That's it! Now you have both:
// - /api/dashboard/*  (old, slow routes)
// - /api/dashboard/fast/*  (new, fast routes)
// 
// Update your frontend to use the /fast version
// ============================================

// Other routes...
const reportRoutes = require('./routes/reportRoutes');
app.use('/api/reports', reportRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Dashboard (slow): http://localhost:${PORT}/api/dashboard/metric-cards`);
  console.log(`⚡ Dashboard (fast): http://localhost:${PORT}/api/dashboard/fast/metric-cards-fast`);
});

module.exports = app;
