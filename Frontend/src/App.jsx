import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import PermissionRoute from "./components/PermissionRoute";
import Layout from "./components/layout";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import ExcelUpload from "./components/ExcelUpload";
import ManualRPSUpload from "./components/ManualRPSUpload";
import RepaymentsUpload from "./components/RepaymentsUpload";
import CreateCharges from "./components/CreateChargesUpload";
import DeleteCashflow from "./components/DeleteCashflow";
import ForecloserUpload from "./components/ForecloserUpload";
import LoanApplicationForm from "./components/LoanApplicationForm";
import DownloadExcelTemplates from "./components/DownloadTemplate";
import EVApprovedLoans from "./components/ApprovedLoans";
import EVDisbursedLoans from "./components/DisbursedLoans";
import EVAllLoans from "./components/EVAllLoans";
import BLApprovedLoans from "./components/BLApprovedLoans";
import BLDisbursedLoans from "./components/BLDisbursedLoans";
import BLAllLoans from "./components/BLAllLoans";
import GQFSFApprovedLoans from "./components/GQFsfApprovedLoans";
import GQFSFDisbursedLoans from "./components/GQFsfDisbursedLoans";
import GQFSFAllLoans from "./components/GQFsfAllLoans";
import GQNonFSFApprovedLoans from "./components/GQNonFsfApprovedLoans";
import GQNonFSFDisbursedLoans from "./components/GQNonFsfDisbursedLoans";
import GQNonFSFAllLoans from "./components/GQNonFsfAllLoans";
import AdikoshApprovedLoans from "./components/AdikoshApprovedLoans";
import AdikoshDisbursedLoans from "./components/AdikoshDisbursedLoans";
import AdikoshAllLoans from "./components/AdikoshAllLoans";
import CirclePEApprovedLoans from "./components/CirclePeApprovedLoans";
import CirclePEDisbursedLoans from "./components/CirclePeDisbursedLoans";
import ElysiumApprovedLoans from "./components/ElysiumApprovedLoans";
import ElysiumDisbursedLoans from "./components/ElysiumDisbursedLoans";
import UploadUTR from "./components/UploadUTR";
import ElysiumAllLoans from "./components/ElysiumAllLoans";
import WCTLBLApprovedLoans from "./components/WCTL-BLApprovedLoans";
import WCTLBLDisbursedLoans from "./components/WCTL-BLDisbursedLoans";
import WCTLBLAllLoans from "./components/WCTL-BLAllLoans";
import AldunApprovedLoans from "./components/AldunActiveCases";
import AldunCollection from "./components/AldunCollection";
import MISReportListing from "./components/Reports/ReportsListing";
import MISReportDetail from "./components/Reports/ReportDetail";
import MISReportTrigger from "./components/Reports/TriggerReportForm";
import MISReportDownloads from "./components/Reports/DownloadedReports";
import LoanDetailsPage from "./components/LoanDetailsPage";
import ApprovedCaseDetails from "./components/ApprovedCaseDetails";
import DocumentsPage from "./components/DocumentsPage";
import AdikoshLoginLoans from "./components/AdikoshLoginLoans";
import EVLoginLoans from "./components/EVLoginLoans";
import EVActionScreen from "./components/EVActionScreen";
import AdikoshActionScreen from "./components/AdikoshActionScreen";
import EmbifiApprovedLoans from "./components/EmbifiApprovedLoans";
import EmbifiDisbursedLoans from "./components/EmbifiDisbursedLoans";
import EmbifiAllLoans from "./components/EmbifiAllLoans";
import GQFsfLoginLoans from "./components/GQFsfLoginLoans";
import GQFsfActionScreen from "./components/GQFsfActionScreen";
import GQNonFsfLoginLoans from "./components/GQNonFsfLoginLoans";
import GQNonFsfActionScreen from "./components/GQNonFsfActionScreen";
import GQNonFsfApproveInitiateScreen from "./components/GQNonFsfApproveInitiateScreen";
import GQFsfApproveInitiateScreen from "./components/GQFsfApproveInitiateScreen";
import AdikoshApproveInitiateScreen from "./components/AdikoshApproveInitiateScreen";
import EVApproveInitiateScreen from "./components/EVApproveInitiateScreen";
import ProductsDashboard from "./components/ProductsDashboard";
import EmiClubApprovedLoans from "./components/EmiClubApprovedLoans";
import EmiClubDisbursedLoans from "./components/EmiClubDisbursedLoans";
import EmiClubAllLoans from "./components/EmiClubAllLoans";
import EmiClubLoginLoans from "./components/EmiClubLoginLoans";
import EmiClubActionScreen from "./components/EmiClubActionScreen";
import EmiClubApproveInitiateScreen from "./components/EmiClubApproveInitiateScreen";
import FinsoApprovedLoans from "./components/FinsoApprovedLoans";
import FinsoDisbursedLoans from "./components/FinsoDisbursedLoans";
import FinsoAllLoans from "./components/FinsoAllLoans";
import FinsoLoginLoans from "./components/FinsoLoginLoans";
import FinsoActionScreen from "./components/FinsoActionScreen";
import FinsoApproveInitiateScreen from "./components/FinsoApproveInitiateScreen";
import CustomerGenerateSOA from "./components/CustomerGenerateSOA";
import HEYEVApprovedLoans from "./components/HEYEVApprovedLoans";
import HEYEVDisbursedLoans from "./components/HEYEVDisbursedLoans";
import HEYEVLoginLoans from "./components/HEYEVLoginLoans";
import HEYEVActionScreen from "./components/HEYEVActionScreen";
import HEYEVApproveInitiateScreen from "./components/HEYEVApproveInitiateScreen";
import HEYEVAllLoans from "./components/HEYEVAllLoans";

function App() {
  return (
    <Router>
      <Routes>
        {/* ✅ Public routes */}
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />

        {/* ✅ Protected + Layout wrapper */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* ✅ All pages go INSIDE this layout block */}

          <Route
            path="/dashboard"
            element={
              <PermissionRoute pageName="Dashboard">
                <Dashboard />
              </PermissionRoute>
            }
          />

          <Route
            path="/products-dashboard"
            element={
              <PermissionRoute pageName="Products Dashboard">
                <ProductsDashboard />
              </PermissionRoute>
            }
          />

          <Route
            path="/admin-panel"
            element={
              <PermissionRoute pageName="Admin Panel">
                <AdminPanel />
              </PermissionRoute>
            }
          />

          <Route
            path="/excel-upload"
            element={
              <PermissionRoute pageName="Excel Upload">
                <ExcelUpload />
              </PermissionRoute>
            }
          />

          <Route
            path="/manual-rps-upload"
            element={
              <PermissionRoute pageName="Manual RPS Upload">
                <ManualRPSUpload />
              </PermissionRoute>
            }
          />

          <Route
            path="/repayments-upload"
            element={
              <PermissionRoute pageName="Repayments Upload">
                <RepaymentsUpload />
              </PermissionRoute>
            }
          />

          <Route
            path="/create-charges"
            element={
              <PermissionRoute pageName="Create Charges">
                <CreateCharges />
              </PermissionRoute>
            }
          />

          <Route
            path="/delete-cashflow"
            element={
              <PermissionRoute pageName="Delete Cashflow">
                <DeleteCashflow />
              </PermissionRoute>
            }
          />

          <Route
            path="/customer-soa"
            element={
              <PermissionRoute pageName="Generate Customer SOA">
                <CustomerGenerateSOA />
              </PermissionRoute>
            }
          />

          <Route
            path="/upload-utr"
            element={
              <PermissionRoute pageName="Upload UTR">
                <UploadUTR />
              </PermissionRoute>
            }
          />

          <Route
            path="/forecloserUpload"
            element={
              <PermissionRoute pageName="Forecloser Upload">
                <ForecloserUpload />
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-application-form"
            element={
              <PermissionRoute pageName="Loan Application Form">
                <LoanApplicationForm />
              </PermissionRoute>
            }
          />

          <Route
            path="/products-excel-format"
            element={
              <PermissionRoute pageName="Download Excel Templates">
                <DownloadExcelTemplates />
              </PermissionRoute>
            }
          />

          {/* ✅ Loan routes */}

          <Route
            path="/ev-loans/approved"
            element={
              <PermissionRoute pageName="EV Approved Loans">
                <EVApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/ev-loans/disbursed"
            element={
              <PermissionRoute pageName="EV Disbursed Loans">
                <EVDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/ev-loans/all"
            element={
              <PermissionRoute pageName="EV All Loans">
                <EVAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/ev-loans/login-cases"
            element={
              <PermissionRoute pageName="EV Login Loans">
                <EVLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/ev-loans/login-actions"
            element={
              <PermissionRoute pageName="EV Login Actions">
                <EVActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/ev-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="EV Disburse Initiated">
                <EVApproveInitiateScreen />
              </PermissionRoute>
            }
          />

          {/* ✅ Loan routes */}

          <Route
            path="/hey-ev-loans/approved"
            element={
              <PermissionRoute pageName="Hey EV Approved Loans">
                <HEYEVApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/hey-ev-loans/disbursed"
            element={
              <PermissionRoute pageName="Hey EV Disbursed Loans">
                <HEYEVDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/hey-ev-loans/all"
            element={
              <PermissionRoute pageName="Hey EV All Loans">
                <HEYEVAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/hey-ev-loans/login-cases"
            element={
              <PermissionRoute pageName="Hey EV Login Loans">
                <HEYEVLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/hey-ev-loans/login-actions"
            element={
              <PermissionRoute pageName="Hey EV Login Actions">
                <HEYEVActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/hey-ev-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="Hey EV Disburse Initiated">
                <HEYEVApproveInitiateScreen />
              </PermissionRoute>
            }
          />

            {/* ✅ Loan routes */}

          <Route
            path="/finso-loans/approved"
            element={
              <PermissionRoute pageName="Finso Approved Loans">
                <FinsoApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/finso-loans/disbursed"
            element={
              <PermissionRoute pageName="Finso Disbursed Loans">
                <FinsoDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/finso-loans/all"
            element={
              <PermissionRoute pageName="Finso All Loans">
                <FinsoAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/finso-loans/login-cases"
            element={
              <PermissionRoute pageName="Finso Login Loans">
                <FinsoLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/finso-loans/login-actions"
            element={
              <PermissionRoute pageName="Finso Login Actions">
                <FinsoActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/finso-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="Finso Disburse Initiated">
                <FinsoApproveInitiateScreen />
              </PermissionRoute>
            }
          />

          {/* ✅ Loan routes */}

          <Route
            path="/emiclub-loans/approved"
            element={
              <PermissionRoute pageName="EmiClub Approved Loans">
                <EmiClubApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/emiclub-loans/disbursed"
            element={
              <PermissionRoute pageName="EmiClub Disbursed Loans">
                <EmiClubDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/emiclub-loans/all"
            element={
              <PermissionRoute pageName="EmiClub All Loans">
                <EmiClubAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/emiclub-loans/login-cases"
            element={
              <PermissionRoute pageName="EmiClub Login Loans">
                <EmiClubLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/emiclub-loans/login-actions"
            element={
              <PermissionRoute pageName="EmiClub Login Actions">
                <EmiClubActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/emiclub-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="EmiClub Disburse Initiated">
                <EmiClubApproveInitiateScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/embifi-loans/approved"
            element={
              <PermissionRoute pageName="Embifi Approved Loans">
                <EmbifiApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/embifi-loans/disbursed"
            element={
              <PermissionRoute pageName="Embifi Disbursed Loans">
                <EmbifiDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/embifi-loans/all"
            element={
              <PermissionRoute pageName="Embifi All Loans">
                <EmbifiAllLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/business-loans/approved"
            element={
              <PermissionRoute pageName="BL Approved Loans">
                <BLApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/business-loans/disbursed"
            element={
              <PermissionRoute pageName="BL Disbursed Loans">
                <BLDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/business-loans/all"
            element={
              <PermissionRoute pageName="BL All Loans">
                <BLAllLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/gq-fsf-loans/approved"
            element={
              <PermissionRoute pageName="GQ FSF Approved Loans">
                <GQFSFApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/gq-fsf-loans/disbursed"
            element={
              <PermissionRoute pageName="GQ FSF Disbursed Loans">
                <GQFSFDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/gq-fsf-loans/all"
            element={
              <PermissionRoute pageName="GQ FSF All Loans">
                <GQFSFAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/gq-fsf-loans/login-cases"
            element={
              <PermissionRoute pageName="GQ FSF Login Loans">
                <GQFsfLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/gq-fsf-loans/login-actions"
            element={
              <PermissionRoute pageName="GQ FSF Login Actions">
                <GQFsfActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/gq-fsf-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="GQ FSF Disburse Initiated">
                <GQFsfApproveInitiateScreen />
              </PermissionRoute>
            }
          />

          <Route path="/documents/:lan" element={<DocumentsPage />} />

          <Route
            path="/gq-non-fsf-loans/approved"
            element={
              <PermissionRoute pageName="GQ Non-FSF Approved Loans">
                <GQNonFSFApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/gq-non-fsf-loans/disbursed"
            element={
              <PermissionRoute pageName="GQ Non-FSF Disbursed Loans">
                <GQNonFSFDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/gq-non-fsf-loans/all"
            element={
              <PermissionRoute pageName="GQ Non-FSF All Loans">
                <GQNonFSFAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/gq-non-fsf-loans/login-cases"
            element={
              <PermissionRoute pageName="GQ Non-FSF Login Loans">
                <GQNonFsfLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/gq-non-fsf-loans/login-actions"
            element={
              <PermissionRoute pageName="GQ Non-FSF Login Actions">
                <GQNonFsfActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/gq-non-fsf-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="GQ Non-FSF Disburse Initiated">
                <GQNonFsfApproveInitiateScreen />
              </PermissionRoute>
            }
          />
          <Route
            path="/adikosh-loans/login"
            element={
              <PermissionRoute pageName="Adikosh Login Loans">
                <AdikoshLoginLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/adikosh-loans/approved"
            element={
              <PermissionRoute pageName="Adikosh Approved Loans">
                <AdikoshApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/adikosh-loans/disbursed"
            element={
              <PermissionRoute pageName="Adikosh Disbursed Loans">
                <AdikoshDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/adikosh-loans/all"
            element={
              <PermissionRoute pageName="Adikosh All Loans">
                <AdikoshAllLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/adikosh-loans/login-actions"
            element={
              <PermissionRoute pageName="Adikosh Login Actions">
                <AdikoshActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/adikosh-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="Adikosh Disburse Initiated">
                <AdikoshApproveInitiateScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/circlepe-loans/approved"
            element={
              <PermissionRoute pageName="CirclePe Approved Loans">
                <CirclePEApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/circlepe-loans/disbursed"
            element={
              <PermissionRoute pageName="CirclePe Disbursed Loans">
                <CirclePEDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/elysium-loans/approved"
            element={
              <PermissionRoute pageName="Elysium Approved Loans">
                <ElysiumApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/elysium-loans/disbursed"
            element={
              <PermissionRoute pageName="Elysium Disbursed Loans">
                <ElysiumDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/elysium-loans/all"
            element={
              <PermissionRoute pageName="Elysium All Loans">
                <ElysiumAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/wctl-blloans/approved"
            element={
              <PermissionRoute pageName="WCTL BLApproved Loans">
                <WCTLBLApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/wctl-blloans/disbursed"
            element={
              <PermissionRoute pageName="WCTL BLDisbursed Loans">
                <WCTLBLDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/wctl-blloans/all"
            element={
              <PermissionRoute pageName="WCTL BLAll Loans">
                <WCTLBLAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/aldun-loans/approved"
            element={
              <PermissionRoute pageName="Aldun Active Loans">
                <AldunApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/aldun-loans/collection/:loan_account_number"
            element={
              <PermissionRoute pageName="Aldun Collection">
                <AldunCollection />
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-details/:lan"
            element={
              <PermissionRoute pageName="Loan Details">
                <LoanDetailsPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/approved-loan-details/:lan"
            element={
              <PermissionRoute pageName="Approved Loan Details">
                <ApprovedCaseDetails />
              </PermissionRoute>
            }
          />

          {/* MIS */}
          <Route
            path="/mis-reports/listing"
            element={
              <PermissionRoute pageName="MIS Report Listing">
                <MISReportListing />
              </PermissionRoute>
            }
          />
          <Route
            path="/mis-reports/:reportId"
            element={
              <PermissionRoute pageName="MIS Report Detail">
                <MISReportDetail />
              </PermissionRoute>
            }
          />
          <Route
            path="/mis-reports/:reportId/trigger"
            element={
              <PermissionRoute pageName="Trigger Report">
                <MISReportTrigger />
              </PermissionRoute>
            }
          />
          <Route
            path="/mis-reports/:reportId/downloads"
            element={
              <PermissionRoute pageName="Report Downloads">
                <MISReportDownloads />
              </PermissionRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
