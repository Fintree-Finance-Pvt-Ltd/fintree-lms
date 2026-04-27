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
import CirclePeActionScreen from "./components/CirclePeActionScreen";
import CirclePeAllLoans from "./components/CirclePeAllLoans";
import CirclePeApproveInitiateScreen from "./components/CirclePeApproveInitiateScreen";
import CirclePeLoginLoans from "./components/CirclePeLoginLoans";
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
import EVManualEntry from "./components/EVManualEntry";
import LoanBookingWctlCcOd from "./components/WCTLCCOD/LoanBookingWctlCcOd";
import WCTLCCODAllLoans from "./components/WCTLCCOD/WCTLCCODAllLoans";
import WCTLInventoryAdd from "./components/WCTLCCOD/InventoryAdd";
import InvoiceAdd from "./components/WCTLCCOD/InvoiceAdd";
import RepaymentAdd from "./components/WCTLCCOD/RepaymentAdd";
import InterestLedger from "./components/WCTLCCOD/InterestLedger";
import HeliumManualEntry from "./components/helium/heliumLoanBooking";
import HeliumAllLoans from "./components/helium/heliumAllLoans";
import HeliumApprovedLoans from "./components/helium/heliumApprovedLoans";
import HeliumApprovedLoanDetails from "./components/helium/HeliumApprovedLoanDetails";
import EsignSuccess from "./components/helium/EsignSuccess";
import EsignError from "./components/helium/EsignError";
import HEYEBatteryVActionScreen from "./components/HEYEVBatteryActionScreen";
import HEYEVBatteryLoginLoans from "./components/HEYEVBatteryLoginLoans";
import HEYEVBatteryDisbursedLoans from "./components/HEYEVBatteryDisbursedLoans";
import HEYEVBatteryApproveInitiateScreen from "./components/HEYEVBatteryApproveInitiateScreen";
import HEYEVBatteryAllLoans from "./components/HEYEVBatteryAllLoans";
import HEYEVBatteryApprovedLoans from "./components/HEYEVBatteryApprovedLoans";
import EmbifiCustomerRemarks from "./components/EmbifiCustomerRemarks";
import DealerOnboardingAllLoans from "./components/DealerOnbordingAllLoans";
import DealerOnboardingLoginActions from "./components/DealerOnbordingActionScreen";
import ZypayActionScreen from "./components/ZypayActionScreen";
import ZypayLoginLoans from "./components/ZypayLoginLoans";
import ZypayApproveInitiateScreen from "./components/ZypayApproveInitiateScreen";
import ZypayApprovedLoans from "./components/ZypayApprovedLoans";
import ZypayDisbursedLoans from "./components/ZypayDisbursedLoans";
import ZypayAllLoans from "./components/ZypayAllLoans";
import SCApprovedLoans from "./components/SCApprovedLoans"; // Supply Chain Approved Loans
import SCDisbursedLoans from "./components/SCDisbursedLoans"; // Supply Chain Disbursed Loans
import SCAllLoans from "./components/SCAllLoans"; // Supply Chain All Loans
import ClayooManualEntry from "./components/Clayoo/ClayooLoanBooking";
import ClayooDiburseInitiateScreen from "./components/Clayoo/ClayooDiburseInitiateScreen";
import HospitalEntry from "./components/Clayoo/HospitalEntry";
import ClayyoApprovedLoanDetails from "./components/Clayoo/ClayooApprovedLoanDetails";
import ClayooLoginLoans from "./components/Clayoo/ClayooLoginLoans";
import HospitalList from "./components/Clayoo/ClayooHospitalLists";
import HospitalLoginActions from "./components/Clayoo/ClayooHospitalLoginActions";
import ClayooApprovedLoans from "./components/Clayoo/ClayooApprovedLoans";
import ClayooLimitEntry from "./components/Clayoo/ClayooLimitEntry";
import ClayyoHospitalDetails from "./components/Clayoo/ClayyoHospitalDetails";
import PartnerLimitEntry from "./components/PartnerLimitEntry";
import FldgEntryPage from "./components/FldgEntryPage";
import FldgSummaryPage from "./components/FldgSummaryPage";
import FldgLedgerPage from "./components/FldgLedgerPage";
import PartnerFldgManager from "./components/PartnerFldgManager";
import ALLClayyoCaseScreen from "./components/Clayoo/ClayooAllLoansScreen";
import CustomerListScreen from "./components/Supply Chain/CustomerListScreen";
import InvoiceListScreen from "./components/Supply Chain/InvoiceListScreen";
import InvoiceDetailsScreen from "./components/Supply Chain/InvoiceDetailsScreen";
import RepaymentListScreen from "./components/Supply Chain/RepaymentListScreen";
import SupplierListScreen from "./components/Supply Chain/SupplierListScreen";
import AllocationListScreen from "./components/Supply Chain/AllocationListScreen";
import CustomerDetailsScreen from "./components/Supply Chain/CustomerDetailsScreen";
import SupplyChainInvoiceEntry from "./components/Supply Chain/SupplyChainInvoiceEntry";
import SupplyChainCollectionEntry from "./components/Supply Chain/SupplyChainCollectionEntry";
import ReverseRepayment from "./components/ReverseRepayment";
import ClayooFintreeScreen from "./components/Clayoo/ClayooFintreeScreen";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer } from "react-toastify";
import LoanDigit from "./components/Loan Digit/LoanDigit";
import LoanDigitLoginAction from "./components/Loan Digit/LoanDigitLoginAction";
import LoanDigitDisburseInitiate from "./components/Loan Digit/LoanDigitDisburseInitiate";
import LoanDigitDisbursed from "./components/Loan Digit/LoanDigitDisbursed";
import LoanDigitApproved from "./components/Loan Digit/LoanDigitApproved";
import LoanDigitAllLoans from "./components/Loan Digit/LoanDigitAllLoans";
import LoanDigitDetails from "./components/Loan Digit/LoanDigitAllDetails";
import UpdateUmrn from "./components/UpdateUmrn";
import SMLDisburseInitiate from "./components/switch-my-loan/SMLDisburseInitiate";
import SMLLoginloans from "./components/switch-my-loan/SMLLoginLoans";
import SMLAllLoans from "./components/switch-my-loan/SMLAllLoans";
import RetentionRelease from "./components/RetentionRelease";

 
function App() {
  return (
    <Router>  
 
<ToastContainer
        position="top-right"
        autoClose={3000}
        theme="colored"
      />
 
      {/* <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
      </Routes>
  */}
 
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
          <Route path="/esign/success" element={<EsignSuccess />} />
          <Route path="/esign/error" element={<EsignError />} />

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
            path="/ev-manual-entry"
            element={
              <PermissionRoute pageName="EV Manual Entry">
                <EVManualEntry />
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
                <ReverseRepayment />
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

          {/* WCTL CCOD LOAN ROUTES */}

          <Route
            path="/wctl-ccod/loan-booking-wctl-ccod"
            element={
              <PermissionRoute pageName="WCTL CCOD Loan Book">
                <LoanBookingWctlCcOd />
              </PermissionRoute>
            }
          />

          <Route
            path="/wctl-ccod/all-loans"
            element={
              <PermissionRoute pageName="WCTL CCOD ALL Loans">
                <WCTLCCODAllLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/wctl-ccod/add-inventory/:lan"
            element={
              <PermissionRoute pageName="WCTL CCOD Add Inventory">
                <WCTLInventoryAdd />
              </PermissionRoute>
            }
          />

          <Route
            path="/wctl-ccod/add-invoice/:lan"
            element={
              <PermissionRoute pageName="WCTL CCOD Add Invoice">
                <InvoiceAdd />
              </PermissionRoute>
            }
          />

          <Route
            path="/wctl-ccod/repayment/:lan"
            element={
              <PermissionRoute pageName="Repayment Add">
                <RepaymentAdd />
              </PermissionRoute>
            }
          />

          <Route
            path="/wctl-ccod/interest-ledger/:lan"
            element={
              <PermissionRoute pageName="Interest ledger">
                <InterestLedger />
              </PermissionRoute>
            }
          />

          {/* ✅ Helium Loan routes */}

          <Route
            path="/helium-loans/manual-entry"
            element={
              <PermissionRoute pageName="Helium Manual Entry">
                <HeliumManualEntry />
              </PermissionRoute>
            }
          />

          <Route
            path="/helium-loans/all-loans"
            element={
              <PermissionRoute pageName="Helium All Loans">
                <HeliumAllLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/helium-loans/approved-loans"
            element={
              <PermissionRoute pageName="Helium Approved Loans">
                <HeliumApprovedLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/approved-loan-details-helium/:lan"
            element={
              <PermissionRoute pageName="Approved Loan Details">
                <HeliumApprovedLoanDetails />
              </PermissionRoute>
            }
          />
          {/* Clyoo Loan Route */}
          <Route
            path="/clayoo-loans/loan-booking"
            element={
              <PermissionRoute pageName="Clayoo Loan Booking">
                <ClayooManualEntry />
              </PermissionRoute>
            }
          />

             <Route
            path="/clayoo-loans/hospital-entry"
            element={
              <PermissionRoute pageName="Clayoo Hospital Entry">
                <HospitalEntry />
              </PermissionRoute>
            }
          />

          <Route
            path="/clayoo-loans/login-actions"
            element={
              <PermissionRoute pageName="Clayoo Credit Approval Loans">
                <ClayooDiburseInitiateScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/approved-loan-details-clayoo/:lan"
            element={
              <PermissionRoute pageName="Approved Loan Details">
                <ClayyoApprovedLoanDetails />
              </PermissionRoute>
            }
          />

          <Route
            path="/clayoo-loans/login-cases"
            element={
              <PermissionRoute pageName="Clayoo Login Loans">
                <ClayooLoginLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/approved-loan-details-clayoo-hospital/:lan"
            element={
              <PermissionRoute pageName="Clayyo Hospital Details">
                <ClayyoHospitalDetails />
              </PermissionRoute>
            }
          />

          <Route
            path="/clayoo-loans/hospital-lists"
            element={
              <PermissionRoute pageName="Clayoo Hospital Lists">
                <HospitalList />
              </PermissionRoute>
            }
          />

          <Route
            path="/clayoo-loans/hospital-login-actions"
            element={
              <PermissionRoute pageName="Clayoo Hospital Credit Approval List">
                <HospitalLoginActions />
              </PermissionRoute>
            }
          />

          <Route
            path="/clayoo-loans/approved-loans"
            element={
              <PermissionRoute pageName="Clayyo Operation Approval Loans">
                <ClayooApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/clayoo-loans/fintree-operation"
            element={
              <PermissionRoute pageName="Clayyo Operation All Loans">
                <ClayooFintreeScreen/>
              </PermissionRoute>
            }
          />

          <Route
            path="/clayoo-loans/credit-approved-loans"
            element={
              <PermissionRoute pageName="Clayoo Limit Approval">
                <ClayooLimitEntry />
              </PermissionRoute>
            }
          />
          <Route
            path="/clayoo-loans/all-clayyo-loans-screen"
            element={
              <PermissionRoute pageName="Clayoo All Loans">
                <ALLClayyoCaseScreen />
              </PermissionRoute>
            }
          />

          {/* Loan Digit */}
          <Route
            path="/loan-digit/login-cases"
            element={
              <PermissionRoute pageName="Loan Digit Login Loans">
                <LoanDigit />
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-digit/credit-approval-actions"
            element={
              <PermissionRoute pageName="Loan Digit Credit Approval">
                <LoanDigitLoginAction/>
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-digit/operation-approval-actions"
            element={
              <PermissionRoute pageName="Loan Digit Operation Approval">
                <LoanDigitDisburseInitiate/>
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-digit/approved-loans"
            element={
              <PermissionRoute pageName="Loan Digit Approved Loans">
                <LoanDigitApproved/>
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-digit/disbursed-loans"
            element={
              <PermissionRoute pageName="Loan Digit Disbursed Loans">
                <LoanDigitDisbursed/>
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-digit/all-loans"
            element={
              <PermissionRoute pageName="Loan Digit All Loans">
                <LoanDigitAllLoans/>
              </PermissionRoute>
            }
          />

          <Route
            path="/loan-digit/customer-details"
            element={
              <PermissionRoute pageName="Loan Digit Customer Details">
                <LoanDigitDetails/>
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

          {/* ///////////////    ZYPAY LOAN */}
          <Route
            path="/zypay-loans/approved"
            element={
              <PermissionRoute pageName="Zypay Approved Loans">
                <ZypayApprovedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/zypay-loans/disbursed"
            element={
              <PermissionRoute pageName="Zypay Disbursed Loans">
                <ZypayDisbursedLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/zypay-loans/all"
            element={
              <PermissionRoute pageName="Zypay All Loans">
                <ZypayAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/zypay-loans/login-cases"
            element={
              <PermissionRoute pageName="Zypay Login Loans">
                <ZypayLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/zypay-loans/login-actions"
            element={
              <PermissionRoute pageName="Zypay Login Actions">
                <ZypayActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/zypay-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="Zypay Disburse Initiated">
                <ZypayApproveInitiateScreen />
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
            path="/embifi-loans/collection-remarks"
            element={
              <PermissionRoute pageName="Embifi Remarks">
                <EmbifiCustomerRemarks />
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
          {/* ✅ SUPPLY CHAIN LOAN ROUTES */}

          <Route
            path="/supply-chain-loans/approved"
            element={
              <PermissionRoute pageName="Supply Chain Approved Loans">
                <SCApprovedLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/supply-chain-loans/disbursed"
            element={
              <PermissionRoute pageName="Supply Chain Disbursed Loans">
                <SCDisbursedLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/supply-chain-loans/all"
            element={
              <PermissionRoute pageName="Supply Chain All Loans">
                <SCAllLoans />
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
            path="/circlepe-loans/all"
            element={
              <PermissionRoute pageName="CirclePe All Loans">
                <CirclePeAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/circlepe-loans/login-cases"
            element={
              <PermissionRoute pageName="CirclePe Login Loans">
                <CirclePeLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/circlepe-loans/login-actions"
            element={
              <PermissionRoute pageName="CirclePe Login Actions">
                <CirclePeActionScreen />
              </PermissionRoute>
            }
          />

          <Route
            path="/circlepe-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="CirclePe Disburse Initiated">
                <CirclePeApproveInitiateScreen />
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


          {/* Switch my loan Routes */}

          <Route
            path="/sml-loans/disburse-initiate"
            element={
              <PermissionRoute pageName="Switch my loan Disburse Initiate">
                <SMLDisburseInitiate />
              </PermissionRoute>
            }
          />

          <Route
            path="/sml-loans/login-loans"
            element={
              <PermissionRoute pageName="Switch my loan Login loans">
                <SMLLoginloans />
              </PermissionRoute>
            }
          />

          <Route
            path="/sml-loans/all-loans"
            element={
              <PermissionRoute pageName="Switch my loan All loans">
                <SMLAllLoans />
              </PermissionRoute>
            }
          />

          {/* ✅ Hey EV Battery Loan routes */}

          <Route
            path="/hey-ev-battery-loans/approved"
            element={
              <PermissionRoute pageName="Hey EV Battery Approved Loans">
                <HEYEVBatteryApprovedLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/hey-ev-battery-loans/disbursed"
            element={
              <PermissionRoute pageName="Hey EV Battery Disbursed Loans">
                <HEYEVBatteryDisbursedLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/hey-ev-battery-loans/all"
            element={
              <PermissionRoute pageName="Hey EV Battery All Loans">
                <HEYEVBatteryAllLoans />
              </PermissionRoute>
            }
          />
          <Route
            path="/dealer-onboarding/all"
            element={
              <PermissionRoute pageName="Dealer Onboarding All Loans">
                <DealerOnboardingAllLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/hey-ev-battery-loans/login-cases"
            element={
              <PermissionRoute pageName="Hey EV Battery Login Loans">
                <HEYEVBatteryLoginLoans />
              </PermissionRoute>
            }
          />

          <Route
            path="/hey-ev-battery-loans/login-actions"
            element={
              <PermissionRoute pageName="Hey EV Battery Login Actions">
                <HEYEBatteryVActionScreen />
              </PermissionRoute>
            }
          />
          <Route
            path="/dealer-onboarding/login-actions"
            element={
              <PermissionRoute pageName="Dealer Onboarding Login Actions">
                <DealerOnboardingLoginActions />
              </PermissionRoute>
            }
          />

          <Route
            path="/hey-ev-battery-loans/approve-initiate-actions"
            element={
              <PermissionRoute pageName="Hey EV Battery Disburse Initiated">
                <HEYEVBatteryApproveInitiateScreen />
              </PermissionRoute>
            }
          />

          
          {/* Partner Limit Management */}
          <Route
            path="/partners/limits"
            element={
              <PermissionRoute pageName="Partner Limits">
                <PartnerLimitEntry />
              </PermissionRoute>
            }
          />

          <Route
            path="/update-umrn"
            element={
              <PermissionRoute pageName="Update UMRN">
                <UpdateUmrn />
              </PermissionRoute>
            }
          />

            <Route
            path="/retention-release"
            element={
              <PermissionRoute pageName="Retention Release">
                <RetentionRelease />
              </PermissionRoute>
            }
          />

          <Route
            path="/fldg-entry"
            element={
              <PermissionRoute pageName="FLDG Entry">
                <FldgEntryPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/fldg-summary"
            element={
              <PermissionRoute pageName="FLDG Summary">
                <FldgSummaryPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/partners-master"
            element={
              <PermissionRoute pageName="Partners Master">
                <PartnerFldgManager />
              </PermissionRoute>
            }
          />

          {/* <Route
            path="/fldg-ledger/:partnerId"
            element={
              <PermissionRoute pageName="FLDG Summary">
                <FldgSummaryPage />
              </PermissionRoute>
            }
          /> */}

          <Route path="/fldg-ledger/:partnerId" 
          element={<FldgLedgerPage />} />

          {/* supply chain rotues */}

          <Route
            path="/supply-chain-loans/customers-list"
            element={
              <PermissionRoute pageName="All Customers">
                <CustomerListScreen />
              </PermissionRoute>
            }
          />

          <Route path="/supply-chain-loans/invoice-entry" 
          element={ <PermissionRoute pageName="SC Invoice Entry">
            <SupplyChainInvoiceEntry />
          </PermissionRoute>} />

          <Route path="/supply-chain-loans/collection-entry" 
          element={<PermissionRoute pageName="SC Collection Entry">
            <SupplyChainCollectionEntry />
          </PermissionRoute>} />

          <Route path="/customers/:lan/invoices" 
          element={<InvoiceListScreen />} />

<Route
  path="/invoices/:invoice_number"
  element={<InvoiceDetailsScreen />}
/>

<Route
  path="/customers/:lan/repayments"
  element={<RepaymentListScreen />}
/>

<Route
  path="/customers/:partner_loan_id/suppliers"
  element={<SupplierListScreen />}
/>

        <Route
  path="/customers/:lan/allocation"
  element={<AllocationListScreen />}
/> 

<Route
  path="/customers/:partner_loan_id"
  element={<CustomerDetailsScreen />}
/>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
