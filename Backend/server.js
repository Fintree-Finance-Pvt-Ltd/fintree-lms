require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db'); // ✅ this line
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const excelUploadRoutes = require('./routes/excelUpload');
const loanRoutes = require("./routes/loanRoutes");
const repaymentRoutes = require("./routes/repaymentsRoutes");
const loanChargesRoutes = require("./routes/loanChargesRoutes");
const manualRPSRoutes = require("./routes/manualRPSRoutes");
const DisbursalRoutes = require("./routes/DisbursalRoutes");
const applicationFormRoutes = require("./routes/applicationFormRoutes");
const chargesRoutes = require("./routes/chargesRoutes");
const deleteCashflowRoutes = require("./routes/deleteCashflowRoutes");
const allocationRoutes = require("./routes/allocationRoutes");
const forecloserRoutes = require("./routes/forecloserRoutes");
const forecloserUploadRoutes = require("./routes/forecloserUpload");
const reportsRoutes = require("./routes/reportRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");


const fs = require("fs");
const path = require("path");
const app = express();
app.use(cors());
app.use(express.json());
app.use(cors({
  origin: '*', // <-- Your frontend GitHub Pages URL
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));


app.use(express.static(path.join(__dirname, '../Frontend/dist')));


app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/loan-booking', excelUploadRoutes);
app.use("/api/dashboard", dashboardRoutes);
// app.use("/api/courses", courseRoutes);
app.use("/api/loan", loanRoutes); //  routes chanegd
app.use("/api/repayments", repaymentRoutes);
app.use("/api/loan-charges", loanChargesRoutes);
app.use("/api/manual-rps", manualRPSRoutes);
app.use("/api/disbursal", DisbursalRoutes);
app.use("/api/application-form", applicationFormRoutes);
app.use("/api/charges", chargesRoutes);//  routes chanegd
app.use("/api/delete-cashflow", deleteCashflowRoutes);
app.use("/api/allocate", allocationRoutes);//  routes chanegd
app.use("/api/forecloser-collection", forecloserRoutes); // NOT foreclose-collection
app.use("/api/forecloser", forecloserUploadRoutes); // ✅ Register Route for Forecloser Upload FC Upload
 app.use("/reports", express.static(path.join(__dirname, "/reports")));
app.use("/api/reports", reportsRoutes);// ✅ Register Route for Reports


 const reportsPath = path.join(__dirname, "../frontend/public/reports");

if (!fs.existsSync(reportsPath)) {
  fs.mkdirSync(reportsPath, { recursive: true });
}

app.use("/reports", express.static(reportsPath));


app.use("/api/documents", require("./routes/documents"));// ✅ Register Route for Documents
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // To serve uploaded files

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/dist', 'index.html'));
  });

app.listen(5003, () => console.log('✅ Backend server running on port 5003'));
