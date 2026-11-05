const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {buildDailySchedule,buildMonthlySchedule,generateRepaymentScheduleArthavidhiCapital}=require("../services/arthavidhiDailySchedule");
const completionHelpers=require("../services/ArthavidhiCapitalAgreementStatus");
function isolated(file,mocks) {
  const module={exports:{}};
  const workflowOnly=file.endsWith("#workflow");
  let source=fs.readFileSync(path.join(__dirname,"..",file.replace("#workflow","")),"utf8");
  if(workflowOnly)source=source.slice(source.indexOf("function arthavidhiCheckConfiguration()"),source.indexOf("async function editArthavidhiPreBureauCase("))+source.split("// BEGIN ARTHAVIDHI WORKFLOW")[1].split("// END ARTHAVIDHI WORKFLOW")[0]+"\nmodule.exports=registerArthavidhiWorkflow;";
  else if(file.endsWith("ArthavidhiCapitalRoutes.js"))source=source.replace("registerArthavidhiWorkflow(router, { pullBureau: pullArthavidhiCapitalBureau });","");
  vm.runInNewContext(source,{
    module,exports:module.exports,require:n=>{if(n in mocks)return mocks[n];throw Error(`Unexpected dependency ${n}`);},
    console,process:{env:{}},URL,Date,Intl,Buffer,
  },{filename:file});
  return module.exports;
}

function uploadedPolicy() {
  return isolated("routes/ArthavidhiCapital/ArthavidhiCapitalBRE.js",{
    "../../config/db":{},"../../services/arthavidhiDailySchedule":{buildMonthlySchedule},
  }).evaluateArthavidhiCreditPolicy;
}
function policyModule(){return isolated("routes/ArthavidhiCapital/ArthavidhiCapitalBRE.js",{"../../config/db":{},"../../services/arthavidhiDailySchedule":{buildMonthlySchedule},"fast-xml-parser":require("fast-xml-parser")});}
function completeAssessment(){
  const a={business_vintage_years:2,monthly_revenue:50000,industry:"Retail",owned_residence:true,bank_statement_months:12,bank_account_type:"current",inward_cheque_return_percent:5,outward_cheque_return_percent:10,proposed_interest_rate:18,tenure_months:12,assessed_monthly_income:50000,existing_monthly_obligations:1000,average_bank_balance:20000,minimum_daily_bank_balance:20000,residence_business_distance_km:10,ho_foir_limit_percent:50,ho_review_notes:"HO reviewed income evidence, applicable FOIR and local distance requirement",ho_review_by:"7",ho_foir_reviewed:true,ho_distance_reviewed:true,verification_notes:"Business documents, related-party KYC, bank statements, ownership and FI evidence checked"};
  for(const key of ["micro_small_business_verified","applicable_co_applicants_verified","independent_income_assessment_verified","business_verification_documents_verified","ownership_proof_verified","field_investigation_verified","location_risk_review_verified","applicant_and_related_party_kyc_verified","applicable_business_licences_verified","business_end_use"])a[key]=true;
  return a;
}
function emptyProfile(score=700,message=""){return `<INProfileResponse><SCORE><BureauScore>${score??""}</BureauScore></SCORE><UserMessage><UserMessageText>${message}</UserMessageText></UserMessage><CAPS><CAPS_Summary><CAPSLast180Days>0</CAPSLast180Days></CAPS_Summary></CAPS><CAIS_Summary><Credit_Account><CreditAccountTotal>0</CreditAccountTotal></Credit_Account></CAIS_Summary></INProfileResponse>`;}
test("monthly policy schedules reconcile paise, use the 5th and count tenure in months",()=>{
  for(const tenure of [6,9,12,18])for(const rate of [0,18,36]){
    const result=buildMonthlySchedule(25000.25,rate,tenure,"2026-12-31");
    assert.equal(result.rpsData.length,tenure);assert.equal(result.firstDueDate,"2027-01-05");
    assert.ok(result.rpsData.every(row=>row.due_date.endsWith("-05")));
    assert.equal(result.rpsData.at(-1).closing,0);
    assert.equal(result.rpsData.reduce((sum,row)=>sum+Math.round(row.principal*100),0),2500025);
    assert.equal(result.rpsData.reduce((sum,row)=>sum+Math.round(row.emi*100),0),Math.round(result.totalRepayment*100));
  }
  for(const tenure of [5,19,12.5])assert.throws(()=>buildMonthlySchedule(25000,18,tenure,"2026-01-01"));
});
test("core BRE requires revenue but not other business assessments and retains bureau deviations",()=>{
  const {evaluateStoredArthavidhiPolicy:evaluate}=policyModule();
  const loan={age:30,business_type:"Proprietorship",requested_amount:25000,loan_tenure:12,arthavidhi_capital_policy_inputs:JSON.stringify(completeAssessment())};
  const report={score:700,report_xml:emptyProfile()};
  assert.equal(evaluate({...loan,arthavidhi_capital_policy_inputs:null},report).eligible,false);
  assert.ok(evaluate({...loan,arthavidhi_capital_policy_inputs:null},report).pending.includes("MONTHLY_REVENUE_MISSING"));
  assert.equal(evaluate(loan,report).pending.length,0);
  assert.equal(evaluate(loan,report,{hoApproval:true}).eligible,true);
  const score650={score:650,report_xml:emptyProfile(650)};
  assert.equal(evaluate(loan,score650,{hoApproval:true}).eligible,false);
  const a={...completeAssessment(),co_borrower_verified:true};
  assert.equal(evaluate({...loan,arthavidhi_capital_policy_inputs:a},score650,{hoApproval:true}).eligible,true);
  Object.assign(a,{clean_minor_bureau_verified:true,business_manager_approval_verified:true,ho_deviation_amount_cap:30000});
  const noHit={score:null,report_xml:emptyProfile(null,"No hit")};
  const deviation=evaluate({...loan,arthavidhi_capital_policy_inputs:a},noHit,{hoApproval:true});
  assert.equal(deviation.eligible,true);assert.ok(deviation.deviations.includes("NO_HIT_REQUIRES_BUSINESS_MANAGER_AND_HO_REVIEW"));
  assert.equal(evaluate({...loan,arthavidhi_capital_policy_inputs:a},null,{hoApproval:true}).eligible,false);
  assert.equal(evaluate({...loan,arthavidhi_capital_policy_inputs:a},{score:599,report_xml:emptyProfile(599)},{hoApproval:true}).decision,"REJECTED");
});
test("core BRE keeps amount/tenure bands and bureau deviation caps without banking/risk gates",()=>{
  const {evaluateStoredArthavidhiPolicy:evaluate}=policyModule();
  const loan={age:30,business_type:"Partnership",requested_amount:100000,arthavidhi_capital_policy_inputs:completeAssessment()};
  const report={score:700,report_xml:emptyProfile()};
  assert.equal(evaluate(loan,report,{hoApproval:true,finalTerms:{loan_amount:100000,loan_tenure:18,interest_rate:18}}).eligible,true);
  loan.arthavidhi_capital_policy_inputs.risk_grade="low";loan.arthavidhi_capital_policy_inputs.ho_risk_grade_reviewed=true;
  assert.equal(evaluate(loan,report,{hoApproval:true,finalTerms:{loan_amount:100000,loan_tenure:18,interest_rate:18}}).eligible,true);
  loan.arthavidhi_capital_policy_inputs.average_bank_balance=10;
  assert.ok(!evaluate(loan,report,{hoApproval:true}).rejections.includes("AVERAGE_BANK_BALANCE_BELOW_EMI"));
  const a={...completeAssessment(),clean_minor_bureau_verified:true,business_manager_approval_verified:true,ho_deviation_amount_cap:30000,proposed_loan_amount:30000};
  const lower={...loan,requested_amount:50000,arthavidhi_capital_policy_inputs:a};
  assert.equal(evaluate(lower,{score:620,report_xml:emptyProfile(620)},{hoApproval:true}).eligible,true);
  a.proposed_loan_amount=50000;
  assert.ok(evaluate(lower,{score:620,report_xml:emptyProfile(620)},{hoApproval:true}).rejections.includes("DEVIATION_AMOUNT_EXCEEDS_CAP"));
});
test("bureau policy parser detects adverse history; manual clean flags cannot erase it",()=>{
  const {extractArthavidhiPolicyBureau:extract,evaluateStoredArthavidhiPolicy:evaluate}=policyModule();
  const xml=`<INProfileResponse><SCORE><BureauScore>710</BureauScore></SCORE><CAIS_Account><CAIS_Account_DETAILS><Written_Off_Settled_Status>SETTLED</Written_Off_Settled_Status><Suit_Filed_Wilful_Default>SUIT FILED</Suit_Filed_Wilful_Default><CAIS_Account_History><Year>2026</Year><Month>10</Month><Days_Past_Due>90</Days_Past_Due></CAIS_Account_History></CAIS_Account_DETAILS><CAIS_Account_DETAILS/></CAIS_Account></INProfileResponse>`;
  const facts=extract({score:710,report_xml:xml},new Date("2026-10-24T00:00:00Z"));
  assert.equal(facts.dpd_60_plus_12m,true);assert.equal(facts.dpd_90_plus_24m,true);assert.equal(facts.any_settlement,true);assert.equal(facts.any_suit_filed,true);
  assert.equal(facts.any_write_off,undefined);
  const result=evaluate({age:30,business_type:"LLP",requested_amount:25000,arthavidhi_capital_policy_inputs:{...completeAssessment(),bureau_history_review_verified:true,bureau_any_settlement:false}},{score:710,report_xml:xml},{hoApproval:true});
  assert.ok(result.rejections.includes("ANY_SETTLEMENT"));
  assert.equal(extract({score:710,report_xml:"not xml"}).dpd_60_plus_12m,undefined);
});
test("uploaded Arthavidhi policy checks its own amount, age and score bands",()=>{
  const evaluate=uploadedPolicy();
  const run=(loan={},bureau={},assessment={})=>evaluate({loan:{requested_amount:25000,age:21,business_type:"Proprietorship",...loan},bureau:{score:700,...bureau},assessment},{minimumAmount:10000,repaymentFrequency:"monthly"});
  for(const [loan,code] of [[{requested_amount:9999},"LOAN_AMOUNT_BELOW_MINIMUM"],[{requested_amount:100001},"LOAN_AMOUNT_OUTSIDE_POLICY"],[{age:20},"AGE_OUTSIDE_21_60"],[{age:61},"AGE_OUTSIDE_21_60"]])assert.ok(run(loan).rejections.includes(code));
  assert.ok(run({}, {score:599}).rejections.includes("BUREAU_SCORE_BELOW_600"));
  assert.ok(run({}, {score:650}).pending.includes("CO_BORROWER_VERIFIED_REQUIRES_VERIFICATION"));
  assert.ok(!run({}, {score:700}).pending.includes("CO_BORROWER_VERIFIED_REQUIRES_VERIFICATION"));
  assert.ok(run({}, {score:600}).deviations.includes("SCORE_600_649_REQUIRES_BUSINESS_MANAGER_AND_HO_REVIEW"));
  assert.ok(run({}, {score:null,no_hit:true}).deviations.includes("NO_HIT_REQUIRES_BUSINESS_MANAGER_AND_HO_REVIEW"));
  assert.ok(run({}, {score:null}).pending.includes("BUREAU_SCORE_MISSING"));
});
test("uploaded policy enforces enquiry and credit-history rules without assuming missing facts are clean",()=>{
  const evaluate=uploadedPolicy();
  const run=bureau=>evaluate({loan:{requested_amount:25000,age:30},bureau},{minimumAmount:10000});
  assert.ok(run({enquiries_6m:20,disbursements_against_enquiries_6m:0}).rejections.includes("AT_LEAST_20_ENQUIRIES_WITH_NO_DISBURSEMENT"));
  assert.ok(!run({enquiries_6m:19,disbursements_against_enquiries_6m:0}).rejections.includes("AT_LEAST_20_ENQUIRIES_WITH_NO_DISBURSEMENT"));
  assert.ok(!run({enquiries_6m:20,disbursements_against_enquiries_6m:1}).rejections.includes("AT_LEAST_20_ENQUIRIES_WITH_NO_DISBURSEMENT"));
  assert.ok(run({unsecured_bl_pl_enquiries_3m:11}).rejections.includes("UNSECURED_BL_PL_ENQUIRIES_3M_EXCEED_10"));
  for(const key of ["dpd_60_plus_12m","dpd_90_plus_24m","any_write_off","any_settlement","any_suit_filed","restructured_3y"]){
    assert.ok(run({[key]:true}).rejections.includes(key.toUpperCase()));
    assert.ok(run({}).pending.includes(`${key.toUpperCase()}_UNKNOWN`));
  }
});
test("other business, banking, FOIR, FI and document facts never block the core BRE",()=>{
  const engine=policyModule(),bureau=engine.extractArthavidhiPolicyBureau({score:710,report_xml:emptyProfile(710)});
  const loan={age:30,requested_amount:100000,loan_tenure:18};
  for(const assessment of [{monthly_revenue:25000},{monthly_revenue:25000,business_vintage_years:0,industry:"Jeweller",inward_cheque_return_percent:99,outward_cheque_return_percent:99,average_bank_balance:0,minimum_daily_bank_balance:0,bank_statement_months:0,bank_account_type:"unknown",ho_foir_limit_percent:0,field_investigation_verified:false,applicant_and_related_party_kyc_verified:false,business_end_use:false,residence_business_distance_km:100}]){
    const result=engine.evaluateArthavidhiCreditPolicy({loan,bureau,assessment});
    assert.equal(result.decision,"APPROVED");assert.equal(result.pending.length,0);assert.equal(result.rejections.length,0);assert.equal(result.policy,"ARTHAVIDHI_CORE_BRE");
  }
  const invalid=engine.evaluateArthavidhiCreditPolicy({loan:{...loan,loan_tenure:19},bureau});
  assert.equal(invalid.decision,"REJECTED");assert.ok(invalid.rejections.includes("TENURE_OUTSIDE_AMOUNT_BAND"));
});

test("daily schedules reconcile principal to the paisa and use calendar days",()=>{
  for(const days of [60,70,90,100]) for(const rate of [0,18,36]) {
    const r=buildDailySchedule(20000.25,rate,days,"2026-01-31");
    assert.equal(r.rpsData.length,days);
    assert.equal(r.rpsData[0].due_date,"2026-02-01");
    assert.equal(r.rpsData.at(-1).closing,0);
    assert.equal(r.rpsData.reduce((s,x)=>s+Math.round(x.principal*100),0),2000025);
    assert.equal(r.rpsData.reduce((s,x)=>s+Math.round(x.emi*100),0),Math.round(r.totalRepayment*100));
    assert.ok(r.rpsData.every(x=>x.principal>0&&x.interest>=0));
  }
});
test("daily schedule rejects invalid dates, precision and tenure",()=>{
  for(const args of [[20000,18,0,"2026-01-01"],[20000,18,60,"2026-02-30"],[20000,18,60.5,"2026-01-01"],[20000,-1,60,"2026-01-01"],[20.001,18,60,"2026-01-01"]]) assert.throws(()=>buildDailySchedule(...args));
});

test("staff booking prefers JWT over the shared client API key and never bypasses invalid JWT",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const start=source.indexOf("function authenticateIntake(");
  const end=source.indexOf("// One login handler",start);
  const calls=[];let passed=0;
  const context={authenticateUser:(req,res,next)=>{calls.push("jwt");if(req.headers.authorization==="Bearer valid")next();else res.status(401).json({message:"Invalid or expired token"});},verifyApiKey:(req,res,next)=>{calls.push("key");req.partner={name:req.headers["x-api-key"]==="artha"?"Arthavidhi Capital":"Other Partner"};next();}};
  vm.runInNewContext(source.slice(start,end),context);
  const response={status(c){this.code=c;return this;},json(body){this.body=body;return this;}};
  context.authenticateIntake({headers:{authorization:"Bearer valid","x-api-key":"invalid-default"}},response,()=>passed++);
  assert.equal(passed,1);assert.deepEqual(calls,["jwt"]);
  calls.length=0;
  context.authenticateIntake({headers:{authorization:"Bearer expired","x-api-key":"artha"}},response,()=>passed++);
  assert.equal(response.code,401);assert.equal(passed,1);assert.deepEqual(calls,["jwt"]);
  calls.length=0;
  context.authenticateIntake({headers:{"x-api-key":"artha"}},response,()=>passed++);
  assert.equal(passed,2);assert.deepEqual(calls,["key"]);
  context.authenticateIntake({headers:{"x-api-key":"other"}},response,()=>passed++);
  assert.equal(response.code,403);assert.equal(passed,2);
});

test("bureau adapter reports missing settings and reuses Ya Money service without trusting stale scores",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const adapter=source.slice(source.indexOf("async function pullArthavidhiCapitalBureau("),source.indexOf("async function triggerArthavidhiCapitalBre("));
  const env={EXPERIAN_URL:"https://example.test/bureau",EXPERIAN_PASSWORD:"test-only"};
  let providerCalls=0,providerSuccess=true;const writes=[];
  const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,params)=>{writes.push({sql,params});if(sql.includes("GET_LOCK"))return [[{acquired:1}]];if(sql.startsWith("SELECT *"))return [[customer]];return [{affectedRows:1}];}};
  const context={module:{exports:{}},process:{env},Date,console,TABLE:"loan_booking_arthavidhi",fromArthavidhiBookingRecord:completionHelpers.fromArthavidhiBookingRecord,db:{promise:()=>({getConnection:async()=>conn})},require:name=>{
    assert.equal(name,"../../services/Bueraupullapiservice");
    return {runBureau:async payload=>{providerCalls++;assert.equal(payload.pan_number,"ABCDE1234F");assert.equal(payload.current_address,"Test address");assert.equal(payload.loan_amount,12000);assert.equal(payload.dob,"2000-01-01");return providerSuccess?{success:true,score:700,response:"<INProfileResponse/>"}:{success:false,score:null,response:"Provider failed"};}};
  }};
  vm.runInNewContext(adapter+"\nmodule.exports=pullArthavidhiCapitalBureau;",context);
  const customer={customer_name:"Test Customer",borrower_dob:"2000-01-01",pan_number:"ABCDE1234F",customer_address:"Test address",requested_amount:12000};
  const missing=await context.module.exports("AVCL11002",customer);
  assert.equal(missing.code,"EXPERIAN_CONFIG_MISSING");assert.equal(missing.missingFields[0],"EXPERIAN_USER");
  assert.equal(providerCalls,0);assert.equal(writes.length,0);
  env.EXPERIAN_USER="test-only";
  const success=await context.module.exports("AVCL11002",customer);
  assert.equal(success.status,"VERIFIED");assert.equal(success.score,700);assert.equal(providerCalls,1);
  assert.equal(writes.find(w=>w.sql.startsWith("INSERT INTO loan_cibil_reports")).params[2],700);
  writes.length=0;providerSuccess=false;
  const failure=await context.module.exports("AVCL11002",customer);
  assert.equal(failure.success,false);assert.equal(failure.score,null);
  assert.equal(writes.find(w=>w.sql.startsWith("INSERT INTO loan_cibil_reports")).params[2],null);
  assert.equal(writes.find(w=>w.sql.includes("SET cibil_score")).params[0],null);
});
test("preview never writes; persistence refuses to overwrite existing repayments",async()=>{
  const r=await generateRepaymentScheduleArthavidhiCapital(null,"AVCL11000",25000,18,12,"2026-01-01","UBL","Arthavidhi Capital",{persist:false});
  assert.equal(r.rpsData.length,12);
  let writes=0;
  await assert.rejects(()=>generateRepaymentScheduleArthavidhiCapital({query:async(sql)=>{if(!/^\s*SELECT\b/i.test(sql))writes++;return [[{id:1}]];}},"AVCL11000",25000,18,12,"2026-01-01"),/already exists/);
  assert.equal(writes,0);
});
function workflow({loan={},kyc, signed=true,mandateStatus="ACTIVE",mandateUmrn="UMRN1",mandatePresent=true,onMandate,onEsign,onEmail,bureauResult,reviewPermission=true}={}) {
  const routes={},events=[],reads=[];
  const current={arthavidhi_capital_policy_result:JSON.stringify({eligible:true,ho_approved_by:"7"}),tenure_unit:"months",repayment_frequency:"monthly",lan:"AVCL11000",status:"partner_approved",aml_status:"PROCEED",arthavidhi_capital_bre_status:"BRE APPROVED",account_number:"12345678901",ifsc:"HDFC0000001",emi_amount:400,mobile_number:"9876543210",name_in_bank:"Test Customer",bank_name:"Bank",...loan};
  const query=async(sql,params)=>{
    if(sql.startsWith("SELECT"))reads.push({sql,params});
    if(sql.includes("SELECT COUNT(*) AS total"))return [[{total:1}]];
    if(sql.includes("FROM pages p JOIN user_permissions"))return [reviewPermission?[{id:1}]:[]];
    if(sql.includes("SELECT * FROM loan_booking")||sql.includes("SELECT status FROM loan_booking")) return [[current]];
    if(sql.includes("SELECT customer_name,email"))return [[{customer_name:"Test Customer",email:"customer@example.test"}]];
    if(sql.includes("SELECT score,report_xml"))return [[{score:700,report_xml:"<INProfileResponse/>"}]];
    if(sql.includes("FROM kyc_verification_status"))return [kyc?[kyc]:["bre_approved","Credit Initiated"].includes(current.status)?[{bureau_status:"VERIFIED"}]:[]];
    if(sql.includes("FROM esign_documents"))return [signed?[{id:1}]:[]];
    if(sql.includes("FROM enach_mandates"))return [mandatePresent?[{id:1,document_id:"MANDATE1",lan:current.lan,status:mandateStatus,umrn:mandateUmrn,account_no:current.account_number,ifsc:current.ifsc,mandate_amount:1000}]:[]];
    if(sql.includes("GET_LOCK"))return [[{acquired:1}]];
    if(sql.includes("RELEASE_LOCK"))return [[{released:1}]];
    if(sql.startsWith("UPDATE")||sql.startsWith("INSERT")){events.push({sql,params});return [{affectedRows:1}];}
    throw Error(`Unexpected SQL ${sql}`);
  };
  const conn={query,beginTransaction:async()=>events.push("begin"),commit:async()=>events.push("commit"),rollback:async()=>events.push("rollback"),release:()=>events.push("release")};
  const register=isolated("routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js#workflow",{
    "../../config/db":{promise:()=>({getConnection:async()=>conn,query})},
    "../../middleware/verifyToken":()=>{},"./ArthavidhiCapitalBRE":{autoRunArthavidhiCapitalBreIfReady:async()=>{events.push("run-bre");return {status:"PENDING"};},readPolicyInputs:value=>typeof value==="string"?JSON.parse(value):value||{},evaluateStoredArthavidhiPolicy:()=>({eligible:current.arthavidhi_capital_bre_status!=="Pending",deviations:[],reason:"Test policy checks"})},
    "../../services/arthavidhiDailySchedule":{buildMonthlySchedule},
    "../../services/ArthavidhiCapitalAgreementStatus":{...completionHelpers,loadArthavidhiCapitalAgreementStatus:async(db,rows)=>rows},
    "../enachRoutes":{createMandate:async(req,res)=>{if(onMandate)onMandate(req);return res.json({success:true,documentId:"MANDATE1"});}},
    "../../services/doqfyEsignService":{initDoqfyEsign:async()=>onEsign?onEsign():({success:true,sign_url:"https://example.test/sign"})},
    "../../jobs/mailer":{sendAgreementSigningMail:async input=>onEmail?onEmail(input):({status:"SENT"})},
    "../../services/arthavidhiRejection":{releaseArthavidhiReservations:async()=>events.push("release-reservation"),restoreArthavidhiReservations:async()=>events.push("restore-reservation")},
    "./arthavidhiWebhook":{sendArthavidhiWebhook:async()=>events.push("sent-webhook")},
  });
  const router={};for(const method of ["get","post","patch"])router[method]=(p,a,h)=>routes[`${method} ${p}`]=h;
  register(router,{pullBureau:async()=>{events.push("bureau-provider");return bureauResult||{status:"VERIFIED"};}});
  return {events,reads,loan:current,async call(route,body={},extra={}){
    const res={code:200,status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
    const handler=routes[route];
    await handler({params:{lan:"AVCL11000"},query:{},body,user:{id:7,role:"HO"},...extra},res);
    return res;
  }};
}

test("manual credit review records approval without rechecking or changing bureau/AML/BRE facts",async()=>{
  for(const policy of [{eligible:true},{eligible:false,pending:["BUREAU_SCORE_MISSING"]},{eligible:true,synthetic:true,dataSource:"UAT_DEMO_NOT_PROVIDER_VERIFIED"}]){
    const w=workflow({loan:{aml_status:"ERROR",arthavidhi_capital_policy_result:JSON.stringify(policy),arthavidhi_capital_bre_status:"BRE REVIEW"},kyc:{bureau_status:"PENDING"}});
    const res=await w.call("patch /:lan/credit-decision",{decision:"approve"},{user:{id:9,role:"Credit Team"}});
    assert.equal(res.code,200);assert.equal(res.body.data.status,"credit_approved");assert.ok(w.events.includes("commit"));assert.ok(w.events.includes("sent-webhook"));assert.ok(w.events.indexOf("sent-webhook")>w.events.indexOf("commit"));
    const update=w.events.find(event=>event.sql?.includes("SET status=?,stage=?,credit_decision_by"));
    assert.equal(update.params[0],"credit_approved");assert.equal(update.params[1],"credit_approved");assert.equal(update.params[2],"9");
    const saved=JSON.parse(w.events.find(event=>event.sql?.includes("SET arthavidhi_capital_policy_result=?")).params[0]);
    assert.equal(saved.eligible,policy.eligible);assert.equal(saved.synthetic,policy.synthetic);assert.equal(saved.credit_decision_mode,"MANUAL_REVIEW");
    assert.ok(!w.events.some(event=>event.sql&&/SET (aml_status|cibil_score|bureau_status|arthavidhi_capital_bre_status)/.test(event.sql)));
  }
});

test("staff can approve standard credit; HO assessment controls remain protected",async()=>{
  const w=workflow();
  const staff={user:{id:9,role:"Credit Team"}};
  assert.equal((await w.call("patch /:lan/credit-decision",{decision:"approve"},staff)).code,200);
  assert.ok(w.events.includes("commit"));
  const preCredit=workflow({loan:{status:"bre_approved"}});
  assert.equal((await preCredit.call("post /:lan/run-bre",{assessment:{ho_foir_reviewed:true,ho_review_notes:"Claimed HO",verification_notes:"Checked"}},staff)).code,403);
  assert.equal((await preCredit.call("post /:lan/run-bre",{assessment:{ho_review_by:"7",verification_notes:"Forged reviewer"}},staff)).code,400);
  const ho=workflow({loan:{status:"bre_approved"}});
  const saved=await ho.call("post /:lan/run-bre",{assessment:{monthly_revenue:50000,verification_notes:"Verified bank statements",ho_foir_reviewed:true,ho_foir_limit_percent:50,ho_review_notes:"HO confirmed applicable ratio"}});
  assert.equal(saved.code,200);
  const write=ho.events.find(event=>event.sql?.includes("SET arthavidhi_capital_policy_inputs"));
  assert.equal(JSON.parse(write.params[0]).ho_review_by,"7");
  const locked=workflow({loan:{status:"credit_approved"}});
  assert.equal((await locked.call("post /:lan/run-bre",{assessment:{monthly_revenue:60000,verification_notes:"Changed"}})).code,409);
});

test("enquiry parser uses full calendar lookback dates and never infers correlated disbursements",()=>{
  const {extractArthavidhiPolicyBureau:extract}=policyModule();
  const entry=(date,type)=>`<CAPS_Application_Details><Date_of_Request>${date}</Date_of_Request><Type_of_Loan>${type}</Type_of_Loan></CAPS_Application_Details>`;
  const xml=`<INProfileResponse><CAPS>${entry("20260424","PERSONAL LOAN")}${entry("20260423","BUSINESS LOAN")}${entry("20260724","PERSONAL LOAN")}${entry("20261025","PERSONAL LOAN")}</CAPS></INProfileResponse>`;
  const facts=extract({report_xml:xml},new Date("2026-10-24T00:00:00Z"));
  assert.equal(facts.enquiries_6m,2);assert.equal(facts.unsecured_bl_pl_enquiries_3m,1);
  assert.equal(facts.disbursements_against_enquiries_6m,undefined);
});

test("only missing-score technical rejections can retry bureau, restoring reservations first",async()=>{
  const w=workflow({loan:{status:"bre_rejected",arthavidhi_capital_bre_reason:"bureau_score is required"}});
  const res=await w.call("post /:lan/retry-bureau");
  assert.equal(res.code,200);
  assert.ok(w.events.indexOf("restore-reservation")<w.events.indexOf("commit"));
  assert.ok(w.events.indexOf("commit")<w.events.indexOf("bureau-provider"));
  for(const loan of [{status:"bre_rejected",arthavidhi_capital_bre_reason:"Minimum bureau score must be 685"},{status:"credit_approved"},{status:"Disbursed"}]){
    const blocked=workflow({loan});
    assert.equal((await blocked.call("post /:lan/retry-bureau")).code,409);
    assert.ok(!blocked.events.includes("bureau-provider"));
    assert.ok(!blocked.events.includes("restore-reservation"));
  }
});

test("missing Experian configuration leaves bureau retry pending rather than returning a credit rejection",async()=>{
  const w=workflow({loan:{status:"Login"},bureauResult:{success:false,status:"PENDING",code:"EXPERIAN_CONFIG_MISSING",message:"Configure EXPERIAN_USER in Backend/.env and restart the backend."}});
  const res=await w.call("post /:lan/retry-bureau");
  assert.equal(res.body.success,false);
  assert.equal(res.body.data.bre.status,"PENDING");
  assert.match(res.body.message,/EXPERIAN_USER/);
  assert.ok(!w.events.includes("release-reservation"));
});

test("technical retry reservation restoration is idempotent and validates availability",async()=>{
  let restored=false,bookedWrites=0,fldgWrites=0;
  const conn={query:async(sql)=>{
    if(sql.includes("SELECT partner_id,month,year"))return [[{partner_id:1,month:10,year:2026}]];
    if(sql.includes("FROM partner_limit_audit WHERE booking_lan"))return [[{amount:restored?12000:0}]];
    if(sql.includes("SELECT fldg_status"))return [[{fldg_status:1,fldg_percent:10}]];
    if(sql.includes("FROM partner_fldg_utilization"))return [[{amount:restored?1200:0}]];
    if(sql.startsWith("UPDATE partner_monthly_limit"))bookedWrites++;
    return [{affectedRows:1}];
  }};
  const helpers=isolated("services/arthavidhiRejection.js",{
    "./partnerLimitService":{validatePartnerBookingLimit:async()=>({valid:true,limitId:7})},
    "./partnerFldgService":{validateFldgAvailability:async()=>({valid:true}),reserveFldg:async()=>fldgWrites++},
  });
  await helpers.restoreArthavidhiReservations(conn,{lan:"AVCL11002",requested_amount:12000});
  restored=true;
  await helpers.restoreArthavidhiReservations(conn,{lan:"AVCL11002",requested_amount:12000});
  assert.equal(bookedWrites,1);assert.equal(fldgWrites,1);
});
test("manual credit decisions cannot advance cases outside the credit queue",async()=>{
  for(const state of ["Disbursed","credit_approved","signing_pending","approved","credit_rejected"]){
    const w=workflow({loan:{status:state}});assert.equal((await w.call("patch /:lan/credit-decision",{decision:"approve"})).code,409);
    assert.ok(!w.events.some(event=>event.sql?.startsWith("UPDATE")));assert.ok(w.events.includes("rollback"));
  }
});

test("rejection requires a reason and releases reservations in its transaction",async()=>{
  const w=workflow();assert.equal((await w.call("patch /:lan/credit-decision",{decision:"rejected"})).code,400);
  assert.equal((await w.call("patch /:lan/credit-decision",{decision:"rejected",reason:"Ineligible"})).code,200);
  assert.ok(w.events.indexOf("release-reservation")<w.events.indexOf("commit"));
});
test("maker approval records manual review and forwards to checker without rewriting provider results",async()=>{
  for(const aml of ["ERROR","PROCEED"]){
    const w=workflow({loan:{status:"ops_initiate",aml_status:aml,arthavidhi_capital_policy_result:JSON.stringify({eligible:true,synthetic:true})},kyc:{pan_status:"PENDING",aadhaar_status:"PENDING",bureau_status:"PENDING"},signed:false,mandatePresent:false});
    const result=await w.call("patch /:lan/ops-maker-decision",{decision:"approved"},{user:{id:9,role:"Ops Maker"}});
    assert.equal(result.code,200);assert.equal(result.body.data.status,"approved");assert.ok(w.events.includes("commit"));
    const write=w.events.find(event=>event.sql?.includes("SET status=?,stage=?,ops_maker_id="));
    assert.equal(write.params[0],"approved");assert.equal(write.params[1],"approved");assert.equal(write.params[2],"9");
    assert.ok(!w.events.some(event=>event.sql&&/SET (aml_status|cibil_score|bureau_status|arthavidhi_capital_policy_result)/.test(event.sql)));
    const audit=w.events.find(event=>event.sql?.includes("arthavidhi_capital_audit"));assert.equal(JSON.parse(audit.params[3]).decision_mode,"MANUAL_REVIEW");
  }
  for(const state of ["credit_approved","signing_pending","approved","Disbursed"]){
    const w=workflow({loan:{status:state}});assert.equal((await w.call("patch /:lan/ops-maker-decision",{decision:"approved"})).code,409);assert.ok(!w.events.some(event=>event.sql?.startsWith("UPDATE")));
  }
  const missingActor=workflow({loan:{status:"ops_initiate"}});
  assert.equal((await missingActor.call("patch /:lan/ops-maker-decision",{decision:"approved"},{user:{}})).code,401);
});

test("final details enforce valid monthly tenure and eligible amount before writing",async()=>{
  const body={loan_amount:25000,interest_rate:18,loan_tenure:12,processing_fee:1000,agreement_date:"2026-10-22",bank_name:"Bank",name_in_bank:"Test Customer",account_number:"12345678901",ifsc:"HDFC0000001"};
  const missingOffer=workflow({loan:{status:"credit_approved",loan_amount:25000,arthavidhi_capital_final_offer:null,arthavidhi_capital_policy_result:null,arthavidhi_capital_bre_status:"Pending"}});
  const missing=await missingOffer.call("patch /:lan/final-details",body);
  assert.equal(missing.code,200);assert.equal(missing.body.data.status,"signing_pending");
  const stagedWrite=missingOffer.events.find(e=>e.sql?.includes("SET loan_amount="));
  assert.ok(stagedWrite);assert.ok(!stagedWrite.sql.includes("policy_result="));
  assert.ok(!stagedWrite.sql.includes("arthavidhi_capital_final_offer="));
  for(const change of [{loan_amount:26000},{loan_tenure:0},{loan_tenure:18},{loan_amount:9999}]){
    const w=workflow({loan:{status:"credit_approved",loan_amount:25000,arthavidhi_capital_final_offer:25000,arthavidhi_capital_offer_tenure_days:60}});
    assert.ok((await w.call("patch /:lan/final-details",{...body,...change})).code>=400);
    assert.ok(!w.events.some(e=>e.sql?.startsWith("UPDATE")));
  }
  const w=workflow({loan:{status:"credit_approved",loan_amount:25000,arthavidhi_capital_final_offer:25000,arthavidhi_capital_offer_tenure_days:60}});
  assert.equal((await w.call("patch /:lan/final-details",body,{user:{id:9,role:"Credit Team"}})).body.data.status,"signing_pending");
  assert.ok(w.events.some(e=>e.sql?.includes("status='signing_pending',stage='signing_pending'")));
});

test("final details accepts Ya Money fields and calculates all deductions server-side",async()=>{
  const loan={status:"credit_approved",requested_amount:25000,loan_amount:25000,arthavidhi_capital_final_offer:25000,arthavidhi_capital_offer_tenure_days:60};
  const body={loan_amount:25000,interest:18,loan_tenure:12,processing_fee_percent:5,insurance_amount:200,pre_emi_interest:100,sanction_date:"2026-10-23",umrn:"umrn-test",bank_name:"Bank",name_in_bank:"Test Customer",account_number:"12345678901",ifsc:"HDFC0000001",net_disbursement:999999};
  const w=workflow({loan});
  const res=await w.call("patch /:lan/final-details",body);
  assert.equal(res.code,200);
  assert.equal(res.body.data.processing_fee,1250);
  assert.equal(res.body.data.insurance_amount,200);
  assert.equal(res.body.data.pre_emi_interest,100);
  assert.equal(res.body.data.net_disbursement,23450);
  assert.equal(res.body.data.umrn,"UMRN-TEST");
  assert.equal(res.body.data.status,"signing_pending");
  const blocked=workflow({loan});
  assert.equal((await blocked.call("patch /:lan/final-details",{...body,insurance_amount:25000})).code,400);
  assert.ok(!blocked.events.some(e=>e.sql?.startsWith("UPDATE")));
});

test("manual maker review does not grant missing policy approval for payout",async()=>{
  const loan={status:"ops_initiate",arthavidhi_capital_policy_result:null};const w=workflow({loan});
  const result=await w.call("patch /:lan/ops-maker-decision",{decision:"approved"});
  assert.equal(result.code,200);assert.equal(result.body.data.status,"approved");
  assert.throws(()=>completionHelpers.requireArthavidhiPolicyApproval({...loan,status:"approved",ops_maker_id:"7"}),/policy.*approval/i);
});

function settlement({already=false,wrongAmount=false,scheduleFails=false,conflict=false}={}){
  const events=[];
  const conn={beginTransaction:async()=>events.push("begin"),commit:async()=>events.push("commit"),rollback:async()=>events.push("rollback"),release:()=>events.push("release"),query:async(sql)=>{
    if(sql.includes("SELECT * FROM loan_booking"))return [[{status:already?"Disbursed":"approved",loan_amount:20000,disbursal_amount:19000,interest_rate:18,loan_tenure:60}]];
    if(sql.includes("FROM ev_disbursement_utr"))return [already||conflict?[{LAN:conflict?"AVCL99999":"AVCL11000",Disbursement_UTR:"UTR1"}]:[]];
    if(sql.includes("FROM quick_transfers"))return [[{amount:wrongAmount?18000:19000}]];
    events.push(sql);return [{affectedRows:1}];
  }};
  const {processArthavidhiCapitalDisbursement:process}=isolated("services/processArthavidhiCapitalDisbursement.js",{
    "./ArthavidhiCapitalAgreementStatus":completionHelpers,
    "../config/db":{promise:()=>({getConnection:async()=>conn})},
    "./arthavidhiDailySchedule":{generateRepaymentScheduleArthavidhiCapital:async()=>{events.push("schedule");if(scheduleFails)throw Error("schedule failed");return {rpsData:[{}]};}},
    "../routes/ArthavidhiCapital/arthavidhiWebhook":{sendArthavidhiWebhook:async()=>events.push("webhook")},
  });
  return {events,run:()=>process({lan:"AVCL11000",disbursementUTR:"UTR1",disbursementDate:"2026-10-22"})};
}
test("duplicate settlement commits without rebuilding repayments",async()=>{
  const s=settlement({already:true});assert.equal((await s.run()).skipped,true);
  assert.ok(!s.events.includes("schedule"));assert.ok(s.events.includes("commit"));
});
test("settlement validates payout amount and UTR conflicts",async()=>{
  for(const opts of [{wrongAmount:true},{conflict:true}]){
    const s=settlement(opts);await assert.rejects(s.run);assert.ok(s.events.includes("rollback"));assert.ok(!s.events.includes("schedule"));
  }
});
test("settlement rolls back failed schedules and commits valid schedules with webhook",async()=>{
  const failed=settlement({scheduleFails:true});await assert.rejects(failed.run);assert.ok(failed.events.includes("rollback"));
  const good=settlement();assert.equal((await good.run()).success,true);
  assert.ok(good.events.indexOf("webhook")>good.events.indexOf("commit"));
});

function checker({attempt=null,maker="6",providerFails=false,settledDuringCall=false,mandateStatus="ACTIVE",state="approved",legacyTransfer=false}={}){
  const events=[];let handler;
  const query=async(sql,params)=>{
    if(sql.includes("SELECT * FROM loan_booking"))return [[{lan:"AVCL11000",account_number:"12345678901",ifsc:"HDFC0000001",emi_amount:400,status:state,tenure_unit:"months",repayment_frequency:"monthly",arthavidhi_capital_policy_result:JSON.stringify({eligible:true,ho_approved_by:"7"}),ops_maker_id:maker,aml_status:"PROCEED",loan_amount:"20000.00",disbursal_amount:"19000.00"}]];
    if(sql.includes("FROM enach_mandates"))return [[{document_id:"MANDATE1",lan:"AVCL11000",status:mandateStatus,umrn:"UMRN1",account_no:"12345678901",ifsc:"HDFC0000001",mandate_amount:1000}]];
    if(sql.includes("SELECT id FROM quick_transfers"))return [legacyTransfer?[{id:1}]:[]];
    if(sql.includes("SELECT request_id,state"))return [attempt?[attempt]:[]];
    if(sql.includes("SELECT score,report_xml"))return [[{score:700,report_xml:"<INProfileResponse/>"}]];
    if(sql.includes("FROM kyc_verification_status"))return [[{pan_status:"VERIFIED",aadhaar_status:"VERIFIED",bureau_status:"VERIFIED"}]];
    if(sql.includes("FROM esign_documents"))return [[{id:1}]];
    events.push({sql,params});return [{affectedRows:settledDuringCall&&sql.includes("state='REQUESTED'")?0:1}];
  };
  const conn={query,beginTransaction:async()=>events.push("begin"),commit:async()=>events.push("commit"),rollback:async()=>events.push("rollback"),release:()=>events.push("release")};
  const router={post(){},get(){},put(paths,auth,fn){if([paths].flat().includes("/:lan/ops-checker-pay"))handler=fn;}};
  isolated("routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js",{
    express:{Router:()=>router},"../../config/db":{promise:()=>({query,getConnection:async()=>conn})},
    "../../middleware/verifyToken":()=>{},"../../middleware/apiKeyAuth":()=>{},
    "../../services/partnerLimitService":{getOrCreatePartner:async()=>({partner_id:1}),validatePartnerDisbursementLimit:async()=>({valid:true,limitId:1}),updateDisbursedLimit:async()=>events.push("reserved-limit")},
    "../../services/partnerFldgService":{},"../../utils/partnerHelpers":{getMonthYear:()=>({month:10,year:2026})},
    axios:{},he:{},"fast-xml-parser":{},crypto:{randomUUID:()=>"claim"},
    "../../services/ArthavidhiCapitalAgreementStatus":completionHelpers,
    "../../services/payout.service":{approveAndInitiatePayout:async()=>{events.push("provider");if(providerFails)throw Error("timeout");return {success:true};}},
  });
  return {events,async run(){const res={code:200,status(c){this.code=c;return this;},json(b){this.body=b;return this;}};await handler({params:{lan:"AVCL11000"},body:{status:"approved"},user:{id:7}},res);return res;}};
}
test("checker cannot approve its own maker decision",async()=>{
  const c=checker({maker:"7"});assert.equal((await c.run()).code,403);assert.ok(!c.events.includes("provider"));
});
test("checker retry never resends existing or settled payout attempts",async()=>{
  for(const state of ["INITIATED","SETTLED","REQUESTED","RECONCILIATION_REQUIRED"]){
    const c=checker({attempt:{state,request_id:"old"}});const res=await c.run();
    assert.equal(res.code,409);
    assert.ok(!c.events.includes("provider"));assert.ok(!c.events.includes("reserved-limit"));
  }
});
test("manual checker approval never calls the payout service, consumes a limit or creates RPS",async()=>{
 const c=checker();const res=await c.run();assert.equal(res.code,200);assert.equal(res.body.final_status,"disburse_initiate");
 assert.ok(c.events.some(e=>e.sql?.includes("stage='Awaiting Manual Payment'")));assert.ok(c.events.includes("commit"));
 assert.ok(!c.events.includes("provider"));assert.ok(!c.events.includes("reserved-limit"));
 assert.ok(!c.events.some(e=>e.sql?.includes("INSERT INTO arthavidhi_capital_payout_attempts")||e.sql?.includes("manual_rps_arthavidhi")));
});

test("manual checker retries are idempotent and legacy transfers require reconciliation",async()=>{
 const pending=checker({state:"disburse_initiate"});const result=await pending.run();assert.equal(result.code,200);assert.equal(result.body.final_status,"disburse_initiate");assert.ok(!pending.events.some(e=>e.sql?.startsWith("UPDATE")));
 const legacy=checker({legacyTransfer:true});assert.equal((await legacy.run()).code,409);assert.ok(!legacy.events.includes("provider"));
});

test("Arthavidhi direct webhooks follow Ya Money logging and bounded retries without a worker",async()=>{
 for(const outcome of ["success","retry-success","http-error","timeout","missing-url"]){
  const events=[];let calls=0;const module={exports:{}};
  const query=async(sql,params)=>{events.push({sql,params});return [{insertId:7,affectedRows:1}];};
  const axios={post:async(url,body,options)=>{calls++;assert.equal(url,"https://example.test/hook");assert.equal(JSON.parse(body).lan,"AVCL11000");assert.equal(options.validateStatus(503),true);if(outcome==="timeout")throw Object.assign(Error("Timed out"),{code:"ETIMEDOUT"});return {status:outcome==="http-error"||(outcome==="retry-success"&&calls===1)?503:200,data:{message:"provider reply"}};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/arthavidhiWebhook.js"),"utf8"),{module,require:n=>n==="axios"?axios:{promise:()=>({query})},process:{env:{ARTHAVIDHI_CAPITAL_WEBHOOK_URL:outcome==="missing-url"?"":"https://example.test/hook",CLIENT_WEBHOOK_RETRY_DELAY_MS:"0"}},setTimeout:fn=>fn(),console:{log(){},error(){}}});
  const result=await module.exports.sendArthavidhiWebhook("AVCL11000","DISBURSED",{utr:"TEST"});
  assert.equal(calls,outcome==="missing-url"?0:outcome==="success"?1:2);
  const insert=events.find(e=>e.sql.includes("INSERT INTO webhook_logs"));assert.ok(insert);const payload=JSON.parse(insert.params[2]);assert.equal(payload.event,"DISBURSED");assert.equal(payload.utr,"TEST");
  const update=events.find(e=>e.sql.includes("UPDATE webhook_logs"));assert.ok(update);assert.equal(update.params[1],["success","retry-success"].includes(outcome)?"SUCCESS":"FAILED");assert.equal(update.params[2],calls);
  const reply=JSON.parse(update.params[0]);if(outcome==="success"||outcome==="retry-success")assert.equal(reply.body.message,"provider reply");if(outcome==="http-error")assert.equal(reply.response_status,503);if(outcome==="timeout")assert.equal(reply.code,"ETIMEDOUT");
  assert.equal(result.success,["success","retry-success"].includes(outcome));
  assert.ok(!events.some(e=>e.sql.includes("GET_LOCK")||e.sql.includes("outbox")));
 }
});

test("allocation pays interest then principal and refreshes only this AVCL loan",async()=>{
  const writes=[];
  const query=async(sql,params)=>{
    if(sql.includes("SELECT lan FROM"))return [[{lan:"AVCL11000"}]];
    if(sql.includes("SELECT allocated_amount"))return [[]];
    if(sql.includes("SELECT id, due_date"))return [[{id:1,due_date:"2026-10-22",emi:"105.00",remaining_interest:"5.00",remaining_principal:"100.00"}]];
    writes.push({sql,params});return [{affectedRows:1}];
  };
  const conn={query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};
  const allocate=isolated("utils/allocate/allocateArthavidhiCapital.js",{"../../config/db":{promise:()=>({query,getConnection:async()=>conn})}});
  const result=await allocate("AVCL11000",{payment_id:"P1",transfer_amount:"55.00",payment_date:"2026-10-22"});
  assert.equal(result.allocated_amount,55);
  const allocations=writes.filter(e=>e.sql.includes("INSERT INTO allocation"));
  assert.equal(allocations[0].params[3],"5.00");assert.equal(allocations[0].params[4],"Interest");
  assert.equal(allocations[1].params[3],"50.00");assert.equal(allocations[1].params[4],"Principal");
  assert.ok(!writes.some(e=>e.sql.includes("CALL")));
  assert.ok(writes.some(e=>e.sql.includes("dpd=CASE")&&e.params[0]==="AVCL11000"));
});

test("manual maker approval never changes pending or cancelled mandate records",async()=>{
  for(const option of [{mandatePresent:false},{mandateStatus:"PENDING"},{mandateStatus:"CANCELLED"},{mandateUmrn:""}]){
    const w=workflow({...option,loan:{status:"ops_initiate"}});
    assert.equal((await w.call("patch /:lan/ops-maker-decision",{decision:"approved"})).code,200);
    assert.ok(w.events.includes("commit"));assert.ok(!w.events.some(event=>event.sql?.includes("UPDATE enach_mandates")));
  }
});

test("checker rechecks active mandate before reserving limits or calling payout",async()=>{
  const c=checker({mandateStatus:"CANCELLED"});assert.equal((await c.run()).code,409);
  assert.ok(!c.events.includes("provider"));assert.ok(!c.events.includes("reserved-limit"));
});
test("mandate readiness rejects bank mismatches, unsafe URLs and insufficient limits",async()=>{
  const loan={lan:"AVCL11000",account_number:"12345678901",ifsc:"HDFC0000001",emi_amount:400};
  const valid={document_id:"M1",lan:loan.lan,status:"ACTIVE",umrn:"UMRN1",account_no:loan.account_number,ifsc:loan.ifsc,mandate_amount:400,auth_url:"https://example.test/authorise"};
  for(const changes of [{account_no:"99999999999"},{ifsc:"ICIC0000001"},{mandate_amount:399},{document_id:""},{status:"AUTHORISED"}]){
    const [row]=await completionHelpers.loadArthavidhiCapitalMandateStatus({query:async()=>[[{...valid,...changes}]]},[loan]);
    assert.equal(row.mandate_ready,false);
  }
  const [good]=await completionHelpers.loadArthavidhiCapitalMandateStatus({query:async()=>[[{...valid,auth_url:"javascript:alert(1)"}]]},[loan]);
  assert.equal(good.mandate_ready,true);assert.equal(good.mandate_auth_url,null);
});
test("mandate initiation reuses an existing request without contacting the provider",async()=>{
  let sent=0;const w=workflow({loan:{status:"ops_initiate"},mandateStatus:"PENDING",onMandate:()=>sent++});
  const response=await w.call("post /:lan/mandate-details");assert.equal(response.code,200);
  assert.equal(response.body.already_initiated,true);assert.equal(sent,0);
});
test("new mandate uses saved loan bank and calculated monthly amount, ignoring client overrides",async()=>{
  let request;const w=workflow({loan:{status:"ops_initiate",loan_amount:25000,interest_rate:18,loan_tenure:12},mandatePresent:false,onMandate:req=>{request=req;}});
  const response=await w.call("post /:lan/mandate-details",{account_no:"99999999",amount:1,customer_identifier:"different"});
  assert.equal(response.code,200);request={body:response.body.data};assert.equal(request.body.account_no,"12345678901");
  assert.equal(request.body.customer_identifier,"9876543210");assert.equal(request.body.frequency,"monthly");
  assert.ok(request.body.amount>300);assert.equal(request.arthavidhiMandateValidated,undefined);
});

test("agreement initiation emails the customer; retry does not send another email",async()=>{
  let deliveries=0;
  const onEmail=async input=>{deliveries++;assert.equal(input.to,"customer@example.test");assert.equal(input.signUrl,"https://example.test/sign");return {status:"SENT"};};
  const w=workflow({onEmail});
  const sent=await w.call("post /:lan/esign");
  assert.equal(sent.code,200);assert.equal(sent.body.notification.status,"SENT");
  const duplicate=workflow({onEmail,onEsign:()=>({success:true,already_initiated:true})});
  assert.equal((await duplicate.call("post /:lan/esign")).body.already_initiated,true);
  assert.equal(deliveries,1);
  const failed=workflow({onEmail:async()=>{throw new Error("SMTP failed");}});
  const pending=await failed.call("post /:lan/esign");
  assert.equal(pending.code,200);assert.equal(pending.body.notification.status,"FAILED");
  assert.match(pending.body.message,/Agreement created, but email delivery failed/);
  const missingTemplate=workflow({onEsign:()=>{throw new Error("Template not found");}});
  assert.equal((await missingTemplate.call("post /:lan/esign")).code,503);
});

test("agreement failures expose the failed step without exposing provider payloads",async()=>{
  const w=workflow({onEsign:()=>{throw Object.assign(new Error("Private provider payload"),{code:"ESIGN_PROVIDER_ORDER_FAILED",arthavidhi_step:"provider_order",provider_http_status:401});}});
  const result=await w.call("post /:lan/esign");
  assert.equal(result.code,502);assert.equal(result.body.step,"provider_order");
  assert.equal(result.body.error_code,"ESIGN_PROVIDER_ORDER_FAILED");assert.equal(result.body.provider_http_status,401);
  assert.ok(!JSON.stringify(result.body).includes("Private provider payload"));
});

test("Network signing errors include the provider reason while redacting identifiers and credentials",async()=>{
  const previous=process.env.ARTHAVIDHI_TEST_SECRET;
  process.env.ARTHAVIDHI_TEST_SECRET="unit-test-provider-secret";
  try{
    const providerError={message:"Invalid branch id; unit-test-provider-secret; test@example.test; ABCDE1234F; 9876543210",code:"BRANCH_INVALID",request:{document:"private-pdf",bank_account:"private-account"}};
    const w=workflow({onEsign:()=>{throw Object.assign(new Error("DOQFY API ERROR: private raw request"),{arthavidhi_step:"provider_order",provider_http_status:400,provider_error:providerError});}});
    const result=await w.call("post /:lan/esign");
    assert.match(result.body.message,/Invalid branch id/);
    assert.equal(result.body.error_details.provider_code,"BRANCH_INVALID");
    for(const value of ["unit-test-provider-secret","test@example.test","ABCDE1234F","9876543210","private-pdf","private-account","private raw request"])
      assert.ok(!JSON.stringify(result.body).includes(value),value);
    const local=completionHelpers.arthavidhiSigningErrorDetails(new Error("Unknown column 'missing_field' in 'field list'"));
    assert.match(local.reason,/Unknown column/);
  }finally{
    if(previous===undefined)delete process.env.ARTHAVIDHI_TEST_SECRET;else process.env.ARTHAVIDHI_TEST_SECRET=previous;
  }
});

test("Arthavidhi agreement uses its own template with the standard PDF renderer",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../services/pdfGenerationService.js"),"utf8");
  const code=source.slice(source.lastIndexOf("exports.generateAgreementPdf = async (lan) => {"));
  const template=fs.readFileSync(path.join(__dirname,"../templates/ArthavidhiCapital_Agreement.html"),"utf8");
  let captured;
  const context={exports:{},getLoanContext:()=>({type:"ARTHAVIDHI_CAPITAL",summaryTable:"arthavidhi_capital_loan_summary",agreementTemplate:"ArthavidhiCapital_Agreement.html"}),
    waitForLoanSummary:async()=>({LAN:"AVCL11000",CUSTOMER_NAME:"Test &amp; Customer",ARTHAVIDHI_REPAYMENT_ROWS:"<tr><td>1</td></tr>"}),
    loadTemplate:()=>template,fillTemplate:(html,data)=>html.replace(/{{\s*(.*?)\s*}}/g,(_,key)=>data[key]??""),
    generatePdfFromHtml:async(html,name,options)=>{captured={html,name,options};},console:{log(){}}};
  vm.runInNewContext(code,context);
  await context.exports.generateAgreementPdf("AVCL11000");
  assert.equal(captured.name,"AGREEMENT_AVCL11000.pdf");assert.equal(captured.options,undefined);
  assert.match(captured.html,/UAT SAMPLE/);assert.match(captured.html,/Test &amp; Customer/);
  assert.ok(!captured.html.includes("{{"));assert.ok(!captured.html.includes("financer-signature-img\" src="));
  for(const script of captured.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script[1]);
});

function esignSender({documentStatus=null,acquired=1,product="ARTHAVIDHI_CAPITAL",loanStatus="signing_pending"}={}){
  const events=[];
  const conn={query:async(sql)=>{
    if(sql.includes("GET_LOCK"))return [[{acquired}]];
    if(sql.includes("SELECT *"))return [[{lan:"AVCL11000",status:loanStatus}]];
    if(sql.includes("FROM esign_documents ed"))return [documentStatus?[{lan:"AVCL11000",document_id:"ORDER1",status:documentStatus,has_signed:documentStatus==="SIGNED"?1:0,raw_response:JSON.stringify({sign_url:"https://example.test/sign"})}]:[]];
    events.push(sql);return [{affectedRows:1}];
  },release:()=>events.push("release")};
  const module={exports:{}};
  const source=fs.readFileSync(path.join(__dirname,"../services/doqfyEsignService.js"),"utf8");
  vm.runInNewContext(source.slice(source.indexOf("exports.initDoqfyEsign = async")),{
    exports:module.exports,db:{promise:()=>({getConnection:async()=>conn})},getLoanContext:()=>({type:product}),
    require:name=>{if(name==="./ArthavidhiCapitalAgreementStatus")return completionHelpers;throw Error("Unexpected dependency "+name);},
    initDoqfyEsign:async()=>{events.push("provider");return {success:true,orderId:"ORDER1"};},
  });
  return {events,run:()=>module.exports.initDoqfyEsign("AVCL11000","AGREEMENT")};
}
test("agreement initiation reuses pending or signed provider requests",async()=>{
  for(const documentStatus of ["INITIATED","SIGNED"]){const e=esignSender({documentStatus});assert.equal((await e.run()).already_initiated,true);assert.ok(!e.events.includes("provider"));assert.ok(e.events.includes("release"));}
});
test("agreement sends once for a new case and rejects concurrent initiation",async()=>{
  const e=esignSender();assert.equal((await e.run()).success,true);assert.equal(e.events.filter(x=>x==="provider").length,1);
  const locked=esignSender({acquired:0});await assert.rejects(locked.run,error=>error.status===409);assert.ok(!locked.events.includes("provider"));
});

test("agreement cannot initiate before final terms have entered the signing stage",async()=>{
  const e=esignSender({loanStatus:"credit_approved"});
  await assert.rejects(e.run,error=>error.status===409);
  assert.ok(!e.events.includes("provider"));
});

test("agreement document preview accepts signing stage without writing schedules and rejects unfinished terms",async()=>{
  const {getArthavidhiCapitalLoanDocumentData}=isolated("services/ArthavidhiCapitalLoanDocumentData.js",{
    "./ArthavidhiCapitalAgreementStatus":completionHelpers,
    dayjs:require("dayjs"),
    "../utils/repaymentScheduleGenerator":{generateRepaymentScheduleArthavidhiCapital},
  });
  const loan={lan:"AVCL11000",status:"signing_pending",loan_amount:25000,interest:18,loan_tenure:12,sanction_date:"2026-10-22",customer_name:"Test Customer",net_disbursement:24000,processing_fee:1000};
  const db={query:async sql=>{assert.match(sql,/SELECT lb\.\*/);return [[loan]];}};
  const document=await getArthavidhiCapitalLoanDocumentData(db,loan.lan);
  assert.equal(document.LAN,loan.lan);assert.equal(document.RPS.length,12);
  loan.status="credit_approved";
  await assert.rejects(()=>getArthavidhiCapitalLoanDocumentData(db,loan.lan),error=>error.code==="FINAL_TERMS_REQUIRED"&&error.status===409);
});

test("signing waits for both provider completions, matching bank, UMRN and final monthly terms",async()=>{
  const {advanceArthavidhiSigningIfComplete}=completionHelpers;
  const loan={lan:"AVCL11000",status:"signing_pending",tenure_unit:"months",repayment_frequency:"monthly",net_disbursement:24000,emi_amount:1000,account_number:"12345678901",ifsc:"HDFC0000001"};
  const mandate={lan:loan.lan,document_id:"M1",status:"ACTIVE",umrn:"U1",mandate_amount:1000,account_no:loan.account_number,ifsc:loan.ifsc};
  for(const scenario of [
    {documentStatus:"PENDING"},
    {mandate:{status:"PENDING"}},
    {mandate:{umrn:null}},
    {mandate:{account_no:"99999999999"}},
    {mandate:{mandate_amount:999}},
    {mandate:{status:"CANCELLED"}},
    {loan:{net_disbursement:null}},
    {loan:{status:"credit_approved"}},
    {loan:{status:"approved"}},
    {},
  ]){
    const writes=[];
    const db={query:async(sql,params)=>{
      if(sql.startsWith("SELECT * FROM loan_booking"))return [[{...loan,...scenario.loan}]];
      if(sql.includes("FROM esign_documents ed"))return [[{lan:loan.lan,document_id:"E1",status:scenario.documentStatus||"SIGNED"}]];
      if(sql.includes("FROM enach_mandates m"))return [[{...mandate,...scenario.mandate}]];
      if(sql.startsWith("UPDATE")){writes.push(params);return [{affectedRows:1}];}
      throw Error("Unexpected promotion query");
    }};
    const result=await advanceArthavidhiSigningIfComplete(db,loan.lan);
    assert.equal(result,Object.keys(scenario).length?0:1,JSON.stringify(scenario));
    assert.equal(writes.length,Object.keys(scenario).length?0:1);
  }
  let touched=false;
  assert.equal(await advanceArthavidhiSigningIfComplete({query:()=>{touched=true;}},"YAM11000"),0);
  assert.equal(touched,false);
});
test("the e-sign wrapper preserves other products' existing dispatch",async()=>{
  const e=esignSender({product:"OTHER_PRODUCT"});await e.run();assert.deepEqual(e.events,["provider"]);
});

function mandateWebhook(saved={id:1,lan:"AVCL11000",status:"PENDING"}){
  const writes=[];
  const source=fs.readFileSync(path.join(__dirname,"../routes/enachRoutes.js"),"utf8");
  const start=source.indexOf("async function applyArthavidhiMandateWebhook(");
  const end=source.indexOf('router.post("/webhooks/digio-mandate"',start);
  const module={exports:{}};
  vm.runInNewContext(source.slice(start,end)+"\nmodule.exports=applyArthavidhiMandateWebhook;",{module,require:()=>({advanceArthavidhiSigningIfComplete:async()=>0}),db:{promise:()=>({query:async(sql,params)=>{
    if(sql.startsWith("SELECT"))return [[saved]];
    writes.push({sql,params});if(sql.startsWith("UPDATE enach_mandates"))saved.status=params[0];return [{affectedRows:1}];
  }})}});
  return {writes,run:event=>module.exports(event,event)};
}
test("mandate callback handles registration and cancellation; old success cannot reactivate cancellation",async()=>{
  const w=mandateWebhook();await w.run({documentId:"M1",registrationStatus:"ACTIVE",umrn:"UMRN1"});
  assert.equal(w.writes[0].params[0],"ACTIVE");
  await w.run({documentId:"M1",status:"apimndt.cancelled",registrationStatus:"ACTIVE"});
  assert.equal(w.writes[2].params[0],"CANCELLED");
  const count=w.writes.length;await w.run({documentId:"M1",registrationStatus:"ACTIVE",umrn:"UMRN1"});
  assert.equal(w.writes.length,count);
});
test("Arthavidhi callback handler leaves other products on their existing path",async()=>{
  const w=mandateWebhook({id:2,lan:"YAM11000",status:"PENDING"});
  assert.equal(await w.run({documentId:"M2",registrationStatus:"ACTIVE",umrn:"UMRN2"}),false);assert.equal(w.writes.length,0);
});

test("booking setup failures identify missing schema or monthly limit without exposing SQL or customer data",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const start=source.indexOf("function bookingFailure(error)");
  const end=source.indexOf("// BEGIN ARTHAVIDHI LOAN BOOKING",start);
  const module={exports:{}};
  vm.runInNewContext(source.slice(start,end)+"\nmodule.exports=bookingFailure;",{module});
  const missing=module.exports({code:"ER_BAD_FIELD_ERROR",message:"SQL with private customer information",sql:"INSERT private data"});
  assert.equal(missing.status,503);assert.equal(missing.code,"ER_BAD_FIELD_ERROR");assert.match(missing.message,/schema/);
  assert.ok(!JSON.stringify(missing).includes("private"));
  const limit=module.exports({message:"No limit record for partner/month/year"});
  assert.equal(limit.status,409);assert.equal(limit.code,"PARTNER_MONTHLY_LIMIT_MISSING");
  const quota=module.exports({code:"ER_USER_LIMIT_REACHED",sqlMessage:"User 'private-db-user' has exceeded the 'max_connections_per_hour' resource (current value: 500)"});
  assert.equal(quota.status,503);assert.equal(quota.resource,"max_connections_per_hour");
  assert.ok(!JSON.stringify(quota).includes("private-db-user"));
  const concurrent=module.exports({code:"ER_TOO_MANY_USER_CONNECTIONS"});
  assert.equal(concurrent.status,503);
  const unknown=module.exports({message:"Sensitive internal exception"});
  assert.equal(unknown.code,"BOOKING_INTERNAL_ERROR");assert.ok(!JSON.stringify(unknown).includes("Sensitive"));
});

test("incomplete drafts persist and resume with the same IDs without reserving limits or running providers",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const draftSource=source.slice(source.indexOf("async function requireUniqueArthavidhiMobile("),source.indexOf("function amount("))+source.slice(source.indexOf("async function saveArthavidhiDraft("),source.indexOf("// BEGIN ARTHAVIDHI LOAN BOOKING"));
  const events=[];let savedStatus="Draft";
  const conn={beginTransaction:async()=>events.push("begin"),commit:async()=>events.push("commit"),rollback:async()=>events.push("rollback"),release:()=>events.push("release"),query:async(sql,params)=>{
    events.push({sql,params});
    if(sql.includes("GET_LOCK"))return [[{acquired:1}]];
    if(sql.startsWith("SELECT lan FROM loan_booking_arthavidhi WHERE mobile_number"))return [[]];
    if(sql.includes("GET_LOCK"))return [[{acquired:1}]];
    if(sql.includes("GET_LOCK"))return [[{acquired:1}]];
    if(sql.includes("SELECT last_sequence"))return [[{last_sequence:10999}]];
    if(sql.includes("SELECT lan,status,partner_loan_id"))return [[{lan:"AVCL11000",partner_loan_id:"AVCLFL11000",status:savedStatus}]];
    return [{affectedRows:1}];
  }};
  const context={module:{exports:{}},db:{promise:()=>({getConnection:async()=>conn})},TABLE:"loan_booking_arthavidhi",PARTNER:"Arthavidhi Capital",SEQUENCE:"ARTHAVIDHI_CAPITAL_CUSTOMER",Intl,Date,
    amount:v=>Number(v).toFixed(2),isoDate:v=>v,bad:(message,status=400)=>{throw Object.assign(new Error(message),{status});},bookingFailure:e=>({status:e.status||500,message:e.message,code:"DRAFT_ERROR"})};
  vm.runInNewContext(draftSource+"\nmodule.exports=saveArthavidhiDraft;",context);
  const res={code:200,status(c){this.code=c;return this;},json(body){this.body=body;return this;}};
  await context.module.exports({user:{id:7},body:{customer_name:"Incomplete Customer"}},res);
  assert.equal(res.body.data.status,"Draft");assert.equal(res.body.data.lan,"AVCL11000");
  const insert=events.find(e=>e.sql?.startsWith("INSERT INTO loan_booking_arthavidhi"));
  assert.ok(insert);assert.ok(events.includes("commit"));
  events.length=0;
  await context.module.exports({user:{id:7},body:{lan:"AVCL11000",customer_name:"Completed Name",mobile_number:"9876543210",requested_amount:12000}},res);
  assert.equal(res.body.data.partner_loan_id,"AVCLFL11000");
  assert.ok(events.some(e=>e.sql?.startsWith("UPDATE loan_booking_arthavidhi")));
  assert.ok(!events.some(e=>e.sql?.includes("loan_sequences")));
  assert.ok(!events.some(e=>e.sql?.includes("partner_master")||e.sql?.includes("partner_limits")||e.sql?.includes("kyc_verification")));
  events.length=0;
  await context.module.exports({user:{id:7},body:{mobile_number:"9876543210",login_date:"2026-10-26",father_name:"Test Father"}},res);
  assert.equal(res.body.data.status,"Draft");
  const mobileDraft=events.find(event=>event.sql?.startsWith("INSERT INTO loan_booking_arthavidhi"));
  assert.ok(mobileDraft.params.includes("Pending identity verification"));assert.ok(mobileDraft.params.includes("2026-10-26"));assert.ok(mobileDraft.params.includes("Test Father"));
  savedStatus="Login";events.length=0;
  await context.module.exports({user:{id:7},body:{lan:"AVCL11000",customer_name:"Overwrite"}},res);
  assert.equal(res.code,409);assert.ok(events.includes("rollback"));
  assert.ok(!events.some(e=>e.sql?.startsWith("UPDATE")));
});

test("manual booking writes the existing Arthavidhi schema and preserves required requested_amount",async()=>{
  let handler,inserted;const events=[];
  // Independent fixture of expected booking columns; no schema setup module dependency.
  const bookingColumns=new Set(["bank_status","sanction_esign_status","sanction_esign_document_id","lan","partner_loan_id","customer_name","status","stage","product","lender","created_at","login_date","borrower_dob","first_name","middle_name","last_name","gender","father_name","mother_name","mobile_number","email","address_line_2","district","business_district","business_state","business_pincode","business_name","business_vintage","industry","employment_type","property_type","aa_bank_name","aa_branch_name","aa_account_type","aa_name_in_bank","aa_account_number","aa_ifsc","bank_name","name_in_bank","account_number","ifsc","ops_checker_id","ops_checker_name","ops_maker_id","credit_decision_by","agreement_esign_document_id","agreement_esign_status","arthavidhi_capital_bre_status","arthavidhi_capital_cibil_band","aml_status","loan_amount","annual_turnover","abb_value","net_profit","loanemi_obligations","pre_emi","processing_fee","emi_amount","apr","reducing_roi","flat_interest","pre_emi_interest","total_repayment","arthavidhi_capital_abb_offer","arthavidhi_capital_cibil_offer","arthavidhi_capital_final_offer","arthavidhi_capital_active_overdue_amount","aml_score","loan_tenure","cibil_score","bounce_count_6m","arthavidhi_capital_aa_eligible","arthavidhi_capital_offer_tenure_days","arthavidhi_capital_enquiries_30d","arthavidhi_capital_unsecured_enquiries_30d","arthavidhi_capital_active_tradeline_count","arthavidhi_capital_dpd_6m_flag","arthavidhi_capital_settled_writtenoff_36m_flag","arthavidhi_capital_willful_default_suit_filed_3y_flag","arthavidhi_capital_active_overdue_3m_flag","arthavidhi_capital_deviation_flag","aml_total_matches","arthavidhi_capital_bre_reason","credit_decision_reason","aml_reason","aml_api_response","arthavidhi_capital_bre_checked_at","agreement_esign_sent_at","aml_checked_at","pan_number","aadhaar_number","customer_address","customer_city","customer_state","customer_pincode","business_type","udyam_number","business_city","interest","net_disbursement","sanction_date","umrn","requested_amount","loan_type","age","annual_income","gst_number","business_address","arthavidhi_capital_policy_inputs","arthavidhi_capital_policy_result","repayment_frequency","tenure_unit","arthavidhi_capital_identity"]);
  const conn={beginTransaction:async()=>{},commit:async()=>events.push("commit"),rollback:async()=>events.push("rollback"),release:()=>{},query:async(sql,params)=>{
    if(sql.includes("GET_LOCK"))return [[{acquired:1}]];
    if(sql.includes("SELECT last_sequence"))return [[{last_sequence:10999}]];
    if(sql.includes("SELECT lan,partner_loan_id,status"))return [[{lan:"AVCL11000",partner_loan_id:"AVCLFL11000",status:"Draft"}]];
    if(sql.includes("SELECT lan FROM"))return [[]];
    if(sql.includes("SELECT fldg_percent"))return [[{fldg_status:0}]];
    if(sql.startsWith("INSERT INTO loan_booking_arthavidhi ")){
      const names=[...sql.matchAll(/`([^`]+)`/g)].map(m=>m[1]);
      assert.ok(names.every(name=>bookingColumns.has(name)));
      inserted=Object.fromEntries(names.map((name,i)=>[name,params[i]]));
    }
    if(sql.startsWith("UPDATE loan_booking_arthavidhi SET `"))events.push("promote-draft");
    if(sql.startsWith("UPDATE loan_sequences"))events.push("advance-sequence");
    return [{affectedRows:1}];
  }};
  const router={get(){},put(){},post(paths,auth,fn){if([paths].flat().includes("/loan-booking"))handler=fn;}};
  isolated("routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js",{
    "../../services/ArthavidhiCapitalAgreementStatus":completionHelpers,express:{Router:()=>router},
    "../../config/db":{promise:()=>({getConnection:async()=>conn})},"../../middleware/verifyToken":()=>{},"../../middleware/apiKeyAuth":()=>{},
    "../../services/partnerLimitService":{getOrCreatePartner:async()=>({partner_id:1}),validatePartnerBookingLimit:async()=>({valid:true,limitId:1}),updateBookedLimit:async()=>{}},
    "../../services/partnerFldgService":{},"../../utils/partnerHelpers":{getMonthYear:()=>({month:10,year:2026})},
    "./ArthavidhiCapitalBRE":{mergeArthavidhiBookingAssessment:policyModule().mergeArthavidhiBookingAssessment,autoRunArthavidhiCapitalBreIfReady:async()=>({decision:"REVIEW",status:"policy_review",pending:["BUSINESS_TYPE_MISSING"],rejections:[]})},
    axios:{},he:{},"fast-xml-parser":{},
    "../../services/trackwizz/screeningService":{screenLoanBooking:async()=>({amlStatus:"PROCEED"})},
  });
  const body={business_name:"Test Business",company_type:"Proprietorship",industry:"Retail",business_vintage:"2",annual_turnover:600000,udyam_registration:"UDYAM-TEST",business_address:"Shop address",business_pincode:"400001",business_city:"Mumbai",business_state:"Maharashtra",assessment:{monthly_revenue:50000},login_date:"2026-10-22",first_name:"Test",last_name:"Customer",gender:"Male",borrower_dob:"2000-01-01",father_name:"Parent",mobile_number:"9876543210",email:"test@example.test",pan_card:"ABCDE1234F",aadhar_number:"123456789012",address_line_1:"Test address",village:"Mumbai",district:"Mumbai",state:"Maharashtra",pincode:"400001",loan_amount:"20000",interest_rate:"18",loan_tenure:12,disbursal_amount:"19000",processing_fee:"1000",emi_amount:"400"};
  const res={code:200,status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
  await handler({body},res);
  assert.equal(res.code,201);assert.ok(events.includes("commit"));
  assert.equal(inserted.requested_amount,"20000.00");assert.equal(inserted.pan_number,body.pan_card);
  assert.equal(inserted.aadhaar_number,body.aadhar_number);assert.equal(inserted.customer_address,body.address_line_1);
  assert.equal(inserted.interest,"18.00");assert.equal(inserted.net_disbursement,"19000.00");
  assert.equal(inserted.lender,"Arthavidhi Capital");assert.equal(inserted.product,"UBL");assert.equal(inserted.stage,"Login");
  for(const old of ["pan_card","interest_rate","disbursal_amount","customer_id"])assert.ok(!(old in inserted));
  const read=completionHelpers.fromArthavidhiBookingRecord({...inserted,id:123});
  assert.equal(read.pan_card,body.pan_card);assert.equal(read.interest_rate,"18.00");assert.equal(read.customer_id,123);
  // The same staff booking endpoint accepts Ya Money login fields without final terms.
  const manual={partner_loan_id:"MANUAL-001",customer_name:"Test Customer",dob:"2000-01-01",annual_income:"300000",mobile_number:"9876543210",pan_number:"ABCDE1234F",aadhaar_number:"123456789012",customer_address:"Test address",customer_city:"Mumbai",customer_state:"Maharashtra",customer_pincode:"400001",requested_amount:"20000",business_name:"Test Business",business_type:"Retail",business_vintage:"2",industry:"Retail",annual_turnover:"600000",assessment:{monthly_revenue:"50000"},gst_number:"27ABCDE1234F1Z5",udyam_number:"UDYAM-MH-01-0000001",business_address:"Business address",business_city:"Mumbai",business_state:"Maharashtra",business_pincode:"400001",abb_value:"50000",bounce_count_6m:0};
  await handler({body:manual},res);
  assert.equal(res.code,201);
  assert.equal(inserted.customer_name,manual.customer_name);
  assert.equal(inserted.partner_loan_id,manual.partner_loan_id);
  assert.equal(inserted.borrower_dob,manual.dob);
  assert.equal(inserted.requested_amount,"20000.00");
  assert.equal(inserted.annual_income,"300000.00");
  assert.equal(inserted.business_type,"Retail");
  assert.equal(inserted.business_address,"Business address");
  assert.equal(inserted.interest,null);
  assert.equal(inserted.loan_tenure,null);
  assert.equal(inserted.net_disbursement,null);
  assert.equal(inserted.emi_amount,null);
  assert.equal(res.body.data.aml.status,"PROCEED");
  assert.equal(res.body.data.bureau.status,"PENDING");
  assert.match(res.body.data.next_action,/Review.*policy issues/);
  for(const field of ["business_name","business_type","industry","business_vintage","annual_turnover","udyam_number","business_address","business_city","business_state","business_pincode"]){
    const incomplete={...manual};delete incomplete[field];
    await handler({body:incomplete},res);
    assert.equal(res.code,400,`${field} must be required`);
    assert.match(res.body.message,/Complete business profile/);
  }
  const withoutGst={...manual};delete withoutGst.gst_number;
  await handler({body:withoutGst},res);assert.equal(res.code,201,"GST remains optional");
  const assessment={business_vintage_years:"2",monthly_revenue:"50000",industry:"Retail",average_bank_balance:"18000",minimum_daily_bank_balance:"10000",bank_statement_months:"12",owned_residence:true,existing_monthly_obligations:"0",micro_small_business_verified:true,verification_notes:"Business evidence checked"};
  await handler({user:{id:7},body:{...manual,requested_amount:"30000",assessment}},res);
  assert.equal(res.code,201);const saved=JSON.parse(inserted.arthavidhi_capital_policy_inputs);
  assert.equal(saved.monthly_revenue,50000);assert.equal(saved.micro_small_business_verified,true);assert.equal(saved.existing_monthly_obligations,0);
  assert.equal(inserted.business_vintage,"2");assert.equal(inserted.industry,"Retail");assert.equal(inserted.abb_value,"18000.00");
  events.length=0;
  await handler({user:{id:7},body:{...manual,lan:"AVCL11000"}},res);
  assert.equal(res.code,201);
  assert.equal(res.body.data.lan,"AVCL11000");
  assert.equal(res.body.data.partner_loan_id,"AVCLFL11000");
  assert.ok(events.includes("promote-draft"));
  assert.ok(!events.includes("advance-sequence"));
});


test("booking is editable only as Draft, including when submitted checks are unavailable",async()=>{
  const states=["Draft","Login","aml_review","bre_approved","policy_review","partner_approved","credit_approved","bre_rejected"];
  const result=await completionHelpers.loadArthavidhiBookingEditability({query:async()=>{throw Error("No bureau lookup needed");}},states.map(status=>({status})));
  assert.deepEqual(result.map(row=>row.can_edit_booking),[true,false,false,false,false,false,false,false]);
});

test("legacy edit_pending cannot change a submitted booking",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const code=source.slice(source.indexOf("async function editArthavidhiPreBureauCase("),source.indexOf("// BEGIN ARTHAVIDHI LOAN BOOKING"));
  const context={};vm.runInNewContext(code,context);const res={status(value){this.code=value;return this;},json(body){this.body=body;return this;}};
  await context.editArthavidhiPreBureauCase({user:{id:7},body:{lan:"AVCL11012",loan_amount:90000}},res);
  assert.equal(res.code,409);assert.equal(res.body.error_code,"BOOKING_LOCKED");
});

test("Arthavidhi AML uses shared screening results and keeps technical failures incomplete",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const functionSource=source.slice(source.indexOf("async function runArthavidhiAml("),source.indexOf("async function editArthavidhiPreBureauCase("));
  let result, failure;
  const calls=[];
  const context={console:{error(){}},require:()=>({screenLoanBooking:async(...args)=>{calls.push(args);if(failure)throw failure;return result;}})};
  vm.createContext(context);vm.runInContext(functionSource,context);
  for(const status of ["PROCEED","REVIEW","STOP"]){
    result={amlStatus:status,amlScore:"92",amlTotalMatches:2,screeningRequestId:17,reportStored:true};
    const aml=await context.runArthavidhiAml("AVCL11000");
    assert.equal(aml.success,true);assert.equal(aml.status,status);
    assert.equal(aml.score,92);assert.equal(aml.total_matches,2);
    assert.equal(aml.screening_request_id,17);assert.equal(aml.report_stored,true);
  }
  assert.deepEqual(calls[0],["arthavidhi_capital","AVCL11000"]);
  await context.runArthavidhiAml("AVCL11000",{retry:true});
  assert.equal(calls.at(-1)[0],"arthavidhi_capital");
  assert.equal(calls.at(-1)[2].force,true);
  result={decision:"PROCEED",amlStatus:"ERROR",degraded:true,reason:"Missing token"};
  const degraded=await context.runArthavidhiAml("AVCL11000");
  assert.equal(degraded.success,false);assert.equal(degraded.status,"ERROR");assert.equal(degraded.score,null);
  failure=Object.assign(new Error("TW_API_TOKEN missing"),{code:"CONFIG"});
  const failed=await context.runArthavidhiAml("AVCL11000");
  assert.equal(failed.success,false);assert.equal(failed.technical_reason,"CONFIG");assert.match(failed.reason,/TW_API_TOKEN/);
});

test("failed bureau retries do not evaluate policy; AML technical failures are not success",async()=>{
  const w=workflow({loan:{status:"Login"},bureauResult:{success:false,status:"FAILED",code:"BUREAU_PULL_FAILED",message:"Provider unavailable"}});
  const res=await w.call("post /:lan/retry-bureau");
  assert.equal(res.body.success,false);assert.equal(res.body.data.bre.status,"PENDING");assert.equal(res.body.message,"Provider unavailable");assert.ok(!w.events.includes("run-bre"));
  const aml=await w.call("post /:lan/aml-screening");
  assert.equal(aml.code,503);assert.equal(aml.body.success,false);assert.equal(aml.body.data.code,"AML_SCREENING_FAILED");assert.ok(!w.events.includes("run-bre"));
});

test("missing bureau still evaluates independent policy checks without granting an offer",async()=>{
  for(const report of [undefined,{score:null,report_xml:"Provider failed"},{score:700,report_xml:"malformed"}]){
    let written;const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,params)=>{
      if(sql.includes("SELECT * FROM loan_booking"))return [[{status:"Login",lan:"AVCL11000",pan_number:"ABCDE1234F",age:30,requested_amount:25000,aml_status:"ERROR",aml_reason:"Missing token"}]];
      if(sql.includes("SELECT bureau_status"))return [[{bureau_status:"PENDING"}]];
      if(sql.includes("SELECT score,report_xml"))return [report?[report]:[]];
      if(sql.startsWith("UPDATE")){written=params;return [{affectedRows:1}];}
      throw Error("Unexpected SQL");
    }};
    const engine=isolated("routes/ArthavidhiCapital/ArthavidhiCapitalBRE.js",{"../../config/db":{promise:()=>({getConnection:async()=>conn})},"../../services/arthavidhiDailySchedule":{buildMonthlySchedule},"fast-xml-parser":require("fast-xml-parser")});
    const result=await engine.autoRunArthavidhiCapitalBreIfReady("AVCL11000");
    assert.equal(result.decision,"REVIEW");assert.equal(result.eligible,false);assert.equal(result.eligibleAmount,null);assert.ok(result.pending.includes("BUREAU_SCORE_MISSING"));assert.equal(written[5],null);assert.ok(!result.pending.includes("MICRO_SMALL_BUSINESS_VERIFIED_REQUIRES_VERIFICATION"));
    assert.ok(!result.pending.includes("HO_APPROVAL_VERIFIED_REQUIRES_VERIFICATION"));
  }
  const review=uploadedPolicy()({loan:{age:30,requested_amount:25000},bureau:{score:700}});
  assert.equal(review.decision,"REVIEW");assert.equal(review.eligibleAmount,null);assert.equal(review.assessedAmount,25000);
});


function identityWorkflow(){
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const code=source.slice(source.indexOf("async function requireUniqueArthavidhiMobile("),source.indexOf("function amount("))+source.slice(source.indexOf("function arthavidhiIdentity("),source.indexOf("// BEGIN ARTHAVIDHI WORKFLOW"));
  const routes={},events=[],sessions=[];
  const loan={id:1,lan:"AVCL11000",status:"Draft",customer_name:"Entered Name",mobile_number:"9876543210"};
  let kyc={};const env={OTP_HASH_PEPPER:"unit-test-only",ALOT_API_URL:"https://sms.example.test",ALOT_USER:"test",ALOT_PASSWORD:"test",SENDER_ID:"test",DLT_PEID:"test",MOBILE_OTP_TEMPLATE_ID:"test",DIGITAP_CLIENT_ID:"test",DIGITAP_CLIENT_SECRET:"test",DIGITAP_BASE_URL:"https://kyc.example.test",AADHAAR_REDIRECT_URL:"https://example.test/return"};
  let aadhaarResponse={code:"102",model:null},aadhaarOptions;
  let duplicateMobile=null;
  let sentOtp="",elapsed=0,editable=true,panResponse={success:true,response:{result:{full_name:"VERIFIED CUSTOMER"}}};
  const query=async(sql,params=[])=>{
    events.push(sql);
    if(sql.includes("GET_LOCK"))return [[{acquired:1}]];
    if(sql.includes("RELEASE_LOCK"))return [[{released:1}]];
    if(sql.startsWith("SELECT * FROM loan_booking"))return [[loan]];
    if(sql.startsWith("SELECT * FROM kyc_verification_status")||sql.startsWith("SELECT aadhaar_status,aadhaar_transaction_id"))return [[kyc]];
    if(sql.startsWith("SELECT TIMESTAMPDIFF"))return [sessions.length?[{elapsed}]:[]];
    if(sql.startsWith("SELECT *,expires_at"))return [sessions.length?[sessions.at(-1)]:[]];
    if(sql.startsWith("SELECT lan FROM"))return [duplicateMobile?[{lan:duplicateMobile}]:[]];
    if(sql.startsWith("INSERT INTO arthavidhi_capital_otp")){sessions.push({id:sessions.length+1,lan:params[0],mobile_number:params[1],otp_hash:params[2],attempts:0,expired:0});return [{affectedRows:1}];}
    if(sql.includes("SET attempts=attempts+1")){sessions.at(-1).attempts++;return [{affectedRows:1}];}
    if(sql.includes("SET verified_at=UTC_TIMESTAMP")){sessions.at(-1).verified_at=new Date();return [{affectedRows:1}];}
    if(sql.includes("SET arthavidhi_capital_identity=")){loan.arthavidhi_capital_identity=params[0];return [{affectedRows:1}];}
    if(sql.includes("SET mobile_number=")){loan.mobile_number=params[0];return [{affectedRows:1}];}
    if(sql.includes("SET customer_name=?,pan_number=")){loan.customer_name=params[0];loan.pan_number=params[1];return [{affectedRows:1}];}
    if(sql.startsWith("INSERT INTO kyc_verification_status")){kyc={...kyc,pan_status:sql.includes("'FAILED'")?"FAILED":"VERIFIED",pan_number:params[4],applicant_name:params[2]};return [{affectedRows:1}];}
    if(sql.includes("SET aadhaar_status='INITIATED'")){Object.assign(kyc,{aadhaar_status:"INITIATED",aadhaar_transaction_id:params[0],aadhaar_unique_id:params[1],aadhaar_kyc_url:params[2]});return [{affectedRows:1}];}
    if(sql.includes("SET aadhaar_status='VERIFIED'")){Object.assign(kyc,{aadhaar_status:"VERIFIED",aadhaar_name:params[0],aadhaar_dob:params[1],aadhaar_masked_number:params[2],aadhaar_address:params[3],aadhaar_api_response:params[4]});return [{affectedRows:1}];}
    if(sql.startsWith("INSERT INTO arthavidhi_capital_audit"))return [{affectedRows:1}];
    if(sql.startsWith("UPDATE kyc_verification_status")){kyc.pan_status="PENDING";kyc.aadhaar_status="PENDING";return [{affectedRows:1}];}
    if(sql.startsWith("UPDATE loan_booking"))return [{affectedRows:1}];
    throw Error("Unexpected identity SQL: "+sql);
  };
  const conn={query,beginTransaction:async()=>events.push("begin"),commit:async()=>events.push("commit"),rollback:async()=>events.push("rollback"),release:()=>events.push("release")};
  const router={post:(route,auth,handler)=>routes["post "+route]=handler,get:(route,auth,handler)=>routes["get "+route]=handler};
  const context={router,authenticateUser:()=>{},db:{promise:()=>({getConnection:async()=>conn})},TABLE:"loan_booking_arthavidhi",Date,URL,Buffer,process:{env},bad:(message,status=400)=>{throw Object.assign(new Error(message),{status});},bookingFailure:error=>({status:error.status||500,message:error.message}),loadArthavidhiBookingEditability:async()=>[{can_edit_booking:editable}],module:{exports:{}},require:name=>{
    if(name==="crypto")return require("crypto");
    if(name==="axios")return {get:async(url,options)=>{events.push("sms-provider");sentOtp=options.params.text.match(/is (\d{6})/)[1];return {data:"1701 accepted"};}};
    if(name.includes("digitapaadharservice"))return {fetchAadhaarKycDetails:async()=>{events.push("aadhaar-status-provider");if(aadhaarResponse instanceof Error)throw aadhaarResponse;return aadhaarResponse;},initAadhaarKyc:async(...args)=>{aadhaarOptions=args[4];events.push("aadhaar-provider");return {success:true,kycUrl:"https://kyc.example.test/customer",unifiedTransactionId:"KYCTEST1",uniqueId:"AVCL11000_TEST"};}};
    throw Error("Unexpected identity dependency "+name);
  }};
  vm.runInNewContext(code+"\nmodule.exports={requireArthavidhiIdentity,arthavidhiAadhaarProfile};",context);
  context.lookupArthavidhiPan=async()=>{events.push("pan-provider");return panResponse;};
  return {loan,sessions,events,env,setDuplicateMobile(value){duplicateMobile=value;},get aadhaarOptions(){return aadhaarOptions;},get kyc(){return kyc;},get otp(){return sentOtp;},setPanResult(value){panResponse=value;},setAadhaarResult(value){aadhaarResponse=value;},setElapsed(n){elapsed=n;},setEditable(value){editable=value;},guard:data=>context.module.exports.requireArthavidhiIdentity(conn,loan,data),async call(method,path,body={},user={id:7},headers={}){
    const route="/:lan/identity"+(path?"/"+path:"");const res={code:200,status(value){this.code=value;return this;},json(value){events.push("response");this.body=value;return this;}};
    await routes[method+" "+route]({params:{lan:loan.lan},route:{path:route},body,user,headers},res);return res;
  }};
}

test("OTP success releases both locks before replying so immediate verification can proceed",async()=>{
  const w=identityWorkflow();
  const sent=await w.call("post","otp/send",{mobile:"9876543210",consent:true});
  assert.equal(sent.body.success,true);
  const response=w.events.indexOf("response"),commit=w.events.indexOf("commit");
  const releases=w.events.map((event,index)=>event.includes("SELECT RELEASE_LOCK")?index:-1).filter(index=>index>=0);
  assert.equal(releases.length,2);
  assert.ok(releases.every(index=>index>commit&&index<response));
  const start=w.events.length;
  assert.equal((await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true})).body.success,true);
  const verification=w.events.slice(start);
  assert.ok(verification.findIndex(event=>event.includes("SELECT RELEASE_LOCK"))<verification.indexOf("response"));
});

test("booking sends OTP once and does not turn a successful send into a failed status refresh",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../Frontend/src/components/ArthavidhiCapital/ArthavidhiCapitalLoanBooking.jsx"),"utf8");
  const fn=source.slice(source.indexOf("async function verifyIdentity("),source.indexOf("async function persistDraft("));
  let sent=false,refreshes=0,posts=0,error="",finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const context={identityRequestRef:{current:false},busy:false,loadingDraft:false,consent:true,resendAt:0,Date,
    values:{mobile_number:"9876543210"},draftLan:"AVCL11000",identity:{},otp:"",editingExisting:false,
    setBusy(){},setError(value){error=value;},setIdentityNotice(){},setOtpSent(value){sent=value;},setOtp(){},setResendAt(){},setIdentity(){},
    refreshIdentity:async()=>{refreshes++;throw Error("Simulated locked status request");},
    api:{post:async()=>{posts++;await pending;return {data:{success:true,message:"OTP sent"}};}},encodeURIComponent};
  vm.createContext(context);vm.runInContext(fn,context);
  const first=context.verifyIdentity("send");await context.verifyIdentity("send");
  finish();await first;
  assert.equal(posts,1);assert.equal(refreshes,0);assert.equal(sent,true);assert.equal(error,"");
  assert.equal(context.identityRequestRef.current,false);
});

test("Aadhaar trigger keeps the new link without requesting completed details immediately",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../Frontend/src/components/ArthavidhiCapital/ArthavidhiCapitalLoanBooking.jsx"),"utf8");
  const fn=source.slice(source.indexOf("async function verifyIdentity("),source.indexOf("async function persistDraft("));
  let identity={panVerified:true,mobileVerified:true},refreshes=0,error="";
  const context={identityRequestRef:{current:false},busy:false,loadingDraft:false,draftLan:"AVCL11000",editingExisting:false,
    Date,encodeURIComponent,identity,values:{},persistDraft:async()=>"AVCL11000",
    setBusy(){},setError(value){error=value;},setIdentityNotice(){},setIdentity(update){identity=update(identity);},
    refreshIdentity:async()=>{refreshes++;throw Error("Provider result is not ready");},
    api:{post:async()=>({data:{success:true,status:"INITIATED",kycUrl:"https://kyc.example.test/customer"}})}};
  vm.createContext(context);vm.runInContext(fn,context);await context.verifyIdentity("aadhaar");
  assert.equal(refreshes,0);assert.equal(error,"");assert.equal(identity.kycUrl,"https://kyc.example.test/customer");
  assert.equal(identity.panVerified,true);assert.equal(identity.aadhaarVerified,false);
  assert.equal(identity.aadhaarStatus,"INITIATED");
});

test("identity OTP requires staff consent, expires and locks after five failures without leaking OTP",async()=>{
  const w=identityWorkflow();
  assert.equal((await w.call("post","otp/send",{mobile:"9876543210",consent:true},null)).code,403);
  assert.equal((await w.call("post","otp/send",{mobile:"9876543210"})).code,400);assert.ok(!w.events.includes("sms-provider"));
  const sent=await w.call("post","otp/send",{mobile:"9876543210",consent:true});
  assert.equal(sent.body.success,true);assert.equal(sent.body.otp,undefined);assert.notEqual(w.sessions[0].otp_hash,w.otp);assert.equal(w.sessions[0].otp_hash.length,64);
  assert.equal((await w.call("post","otp/send",{mobile:"9876543210",consent:true})).code,429);
  const wrong=w.otp==="111111"?"222222":"111111";
  for(let i=0;i<5;i++)assert.equal((await w.call("post","otp/verify",{mobile:"9876543210",otp:wrong,consent:true})).code,422);
  assert.equal(w.sessions[0].attempts,5);assert.equal((await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true})).code,409);
  w.setElapsed(61);await w.call("post","otp/send",{mobile:"9876543210",consent:true});w.sessions.at(-1).expired=1;
  assert.equal((await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true})).code,409);
});

test("identity journey fetches PAN and Aadhaar fields without BRE/payout and enforces verified submission",async()=>{
  const w=identityWorkflow();assert.equal((await w.call("post","pan",{panNumber:"ABCDE1234F"})).code,409);
  await w.call("post","otp/send",{mobile:"9876543210",consent:true});
  assert.equal((await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true})).body.mobileVerified,true);
  assert.equal((await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true})).body.mobileVerified,true);
  const pan=await w.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(pan.body.customerName,"VERIFIED CUSTOMER");assert.equal(w.loan.customer_name,"VERIFIED CUSTOMER");
  await w.call("post","aadhaar");await w.call("post","aadhaar");assert.equal(w.events.filter(event=>event==="aadhaar-provider").length,1);
  assert.equal((await w.call("get","")).body.data.aadhaarVerified,false);
  Object.assign(w.kyc,{aadhaar_status:"VERIFIED",aadhaar_name:"VERIFIED CUSTOMER",aadhaar_dob:"1995-02-03",aadhaar_masked_number:"xxxx-xxxx-1234",aadhaar_api_response:JSON.stringify({data:{address:{house:"12",street:"Main Road",vtc:"Mumbai",state:"Maharashtra",pc:"400001"}}})});
  const status=await w.call("get","");assert.equal(status.body.data.aadhaarVerified,true);assert.equal(status.body.data.profile.customer_address,"12, Main Road");assert.equal(status.body.data.profile.customer_pincode,"400001");assert.equal(status.body.data.profile.aadhaar_number,"XXXXXXXX1234");
  const data={customer_name:"VERIFIED CUSTOMER",mobile_number:"9876543210",pan_card:"ABCDE1234F",aadhar_number:"XXXXXXXX1234",borrower_dob:"1995-02-03"};await w.guard(data);
  await assert.rejects(()=>w.guard({...data,pan_card:"AAAAA1234A"}),/Verify this PAN/);await assert.rejects(()=>w.guard({...data,borrower_dob:"2000-01-01"}),/Date of birth/);await assert.rejects(()=>w.guard({...data,aadhar_number:"XXXXXXXX5678"}),/Aadhaar must match/);
  w.loan.status="credit_approved";w.setEditable(false);assert.equal((await w.call("post","aadhaar")).code,409);
  assert.ok(!w.events.some(event=>/BRE|payout|partner_limit/.test(event)));
});


test("policy EMI can use proposed monthly terms already saved during booking",()=>{
  const assessment=completeAssessment();delete assessment.tenure_months;delete assessment.proposed_interest_rate;
  const result=policyModule().evaluateStoredArthavidhiPolicy({age:30,business_type:"Proprietorship",requested_amount:25000,loan_tenure:12,interest:18,arthavidhi_capital_policy_inputs:assessment},{score:700,report_xml:emptyProfile()},{hoApproval:true});
  assert.equal(result.eligible,true);assert.ok(!result.pending.includes("TENURE_MONTHS_MISSING"));assert.ok(!result.pending.includes("PROPOSED_EMI_REQUIRED_FOR_BANKING_AND_FOIR"));
});


test("Arthavidhi PAN reads Finanalyz response name and string success code without changing shared PAN service",async()=>{
  const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});
  w.setPanResult({success:false,provider:"FINANALYZ",response:{data:{response:{code:"200",isValid:true,name:"FETCHED PAN HOLDER",dateOfBirth:"17-07-1970"}}}});
  const result=await w.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(result.body.success,true);assert.equal(result.body.customerName,"FETCHED PAN HOLDER");assert.equal(result.body.dob,"1970-07-17");assert.equal((await w.call("get","")).body.data.panDob,"1970-07-17");assert.equal(w.kyc.pan_status,"VERIFIED");
});

test("PAN failures expose actionable safe codes, persist FAILED and never grant verification",async()=>{
  for(const [response,expected] of [[{code:401,message:"Invalid API key"},"PAN_PROVIDER_AUTH_FAILED"],[{code:429,message:"Limit reached"},"PAN_PROVIDER_RATE_LIMITED"],[{code:400,message:"Insufficient wallet balance"},"PAN_PROVIDER_ACCOUNT_LIMIT"],[{code:200,isValid:false,name:"INVALID HOLDER"},"PAN_PROVIDER_REJECTED"]]){
    const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});
    w.setPanResult({success:false,provider:"FINANALYZ",response:{data:{response},sensitive:"must-not-return-provider-payload"}});
    const result=await w.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(result.body.success,false);assert.equal(result.body.error_code,expected);assert.equal(w.kyc.pan_status,"FAILED");assert.equal((await w.call("get","")).body.data.panVerified,false);assert.ok(!JSON.stringify(result.body).includes("must-not-return-provider-payload"));assert.ok(w.events.includes("commit"));
  }
});


function arthavidhiPanLookup(env, post) {
 const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
 const code=source.slice(source.indexOf("async function lookupArthavidhiPan("),source.indexOf("function arthavidhiPanResult("));
 const context={process:{env},require:name=>name==="axios"?{post}:require("node:crypto")};
 vm.runInNewContext(code,context);return context.lookupArthavidhiPan;
}

test("Arthavidhi PAN-number-only fallback does not require the shared named verifier",async()=>{
 const calls=[];const lookup=arthavidhiPanLookup({FINANALYZ_X_API_KEY:"test-only"},async(url,payload)=>{calls.push(payload);return {status:200,data:{data:{response:{code:200,isValid:true,name:"FETCHED CUSTOMER",dob:"1995-02-03"}}}};});
 const result=await lookup("ABCDE1234F");assert.equal(result.success,true);assert.equal(result.provider,"FINANALYZ");assert.deepEqual(Object.keys(calls[0]),["panNumber"]);assert.equal(calls[0].panNumber,"ABCDE1234F");
 const invalid=await lookup("INVALID");assert.equal(invalid.success,false);assert.equal(calls.length,1);
});

test("PAN lookup recognises wrapped explicit verification and distinguishes unknown responses from invalid PAN",async()=>{
  for(const response of [{response:{code:200,isValid:true,name:"WRAPPED CUSTOMER",dob:"2000-01-01"}},{data:JSON.stringify({response:{code:200,isValid:true,name:"WRAPPED CUSTOMER",dob:"2000-01-01"}})}]){
    const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});
    w.setPanResult({success:false,provider:"FINANALYZ",httpStatus:200,response});const result=await w.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(result.body.success,true);assert.equal(result.body.customerName,"WRAPPED CUSTOMER");
  }
  for(const [httpStatus,response,expected] of [[401,{error:"Denied"},"PAN_PROVIDER_AUTH_FAILED"],[200,{code:200,name:"UNVERIFIED CUSTOMER"},"PAN_PROVIDER_RESPONSE_UNRECOGNIZED"],[200,"Unexpected provider response","PAN_PROVIDER_RESPONSE_UNRECOGNIZED"]]){
    const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});
    w.setPanResult({success:false,provider:"FINANALYZ",httpStatus,response});const result=await w.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(result.body.success,false);assert.equal(result.body.error_code,expected);assert.equal(result.body.provider_http_status,httpStatus);assert.equal((await w.call("get","")).body.data.panVerified,false);
  }
});


test("Arthavidhi PAN lookup uses Zoop first and Finanalyz fallback without changing the shared service",async()=>{
 let fail=false;const calls=[];
 const env={ZOOP_PAN_API_URL:"https://zoop.example.test",ZOOP_API_KEY:"test",ZOOP_APP_ID:"test",FINANALYZ_PAN_URL:"https://finanalyz.example.test",FINANALYZ_X_API_KEY:"test"};
 const post=async(url,payload,options)=>{calls.push({url,payload,headers:options.headers});if(url.includes("zoop"))return fail?{status:401,data:{response_code:401}}:{status:200,data:{success:true,result:{user_full_name:"FETCHED CUSTOMER",user_dob:"03-02-1995"}}};return {status:500,data:""};};
 const lookup=arthavidhiPanLookup(env,post);
 const result=await lookup("ABCDE1234F");assert.equal(result.success,true);assert.equal(result.provider,"ZOOP");assert.equal(calls.length,1);assert.equal(calls[0].payload.data.customer_pan_number,"ABCDE1234F");assert.equal(calls[0].headers["app-id"],"test");assert.ok(!("pan_holder_name" in calls[0].payload.data));
 calls.length=0;fail=true;const unavailable=await lookup("ABCDE1234F");assert.equal(unavailable.success,false);assert.equal(calls.length,2);assert.ok(calls[0].url.includes("zoop"));assert.ok(calls[1].url.includes("finanalyz"));assert.equal(unavailable.attempts[0].httpStatus,401);assert.equal(unavailable.attempts[1].httpStatus,500);
 const shared={exports:{}};fail=false;calls.length=0;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../services/pancardapiservice.js"),"utf8"),{module:shared,exports:shared.exports,process:{env},console:{log(){},warn(){},error(){}},require:name=>name==="uuid"?{v4:()=>"test-task"}:{post}});
 const missing=await shared.exports.getPanCardDetails("ABCDE1234F",null);assert.equal(missing.reason,"MISSING_FIELDS");assert.equal(calls.length,0);
 await shared.exports.getPanCardDetails("ABCDE1234F","Entered Name");assert.equal(calls.length,1);assert.equal(calls[0].payload.data.pan_holder_name,"ENTERED NAME");assert.equal(calls[0].headers.app_id,"test");
});

test("Zoop PAN profile fills name and DOB; both provider outages stay unverified",async()=>{
  const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});
  w.setPanResult({success:true,provider:"ZOOP",httpStatus:200,response:{success:true,result:{user_full_name:"ZOOP HOLDER NAME",user_dob:"03-02-1995"}}});
  const verified=await w.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(verified.body.success,true);assert.equal(verified.body.customerName,"ZOOP HOLDER NAME");assert.equal(verified.body.dob,"1995-02-03");
  const failed=identityWorkflow();await failed.call("post","otp/send",{mobile:"9876543210",consent:true});await failed.call("post","otp/verify",{mobile:"9876543210",otp:failed.otp,consent:true});
  failed.setPanResult({success:false,provider:"FINANALYZ",httpStatus:500,response:"",attempts:[{provider:"ZOOP",httpStatus:401,success:false},{provider:"FINANALYZ",httpStatus:500,success:false}]});
  const result=await failed.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(result.body.error_code,"PAN_PROVIDERS_UNAVAILABLE");assert.equal((await failed.call("get","")).body.data.panVerified,false);
});


test("PAN DOB parsing accepts provider date formats and never treats missing or masked DOB as a real date",async()=>{
  for(const [details,expected] of [[{user_dob:"3/2/1995"},"1995-02-03"],[{date_of_birth:"1995-2-3 00:00:00"},"1995-02-03"],[{dob:"XX-XX-XXXX",user_dob:"03-02-1995"},"1995-02-03"],[{user_dob:"31-02-1995"},null],[{user_dob:"XX-XX-XXXX"},null],[{},null]]){
    const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});
    w.setPanResult({success:true,provider:"ZOOP",httpStatus:200,response:{success:true,result:{user_full_name:"DOB TEST CUSTOMER",...details}}});
    const result=await w.call("post","pan",{panNumber:"ABCDE1234F"});assert.equal(result.body.success,true);assert.equal(result.body.dob,expected);assert.equal((await w.call("get","")).body.data.panDob,expected);
  }
});


test("Arthavidhi DigiLocker uses shared redirect configuration without a caller override",async()=>{
  for(const origin of ["http://localhost:3000","https://staff.example.test","https://untrusted.example.test"]){
    const w=identityWorkflow();w.env.FRONTEND_URL="https://staff.example.test";
    await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});await w.call("post","pan",{panNumber:"ABCDE1234F"});
    const result=await w.call("post","aadhaar",{},{id:7},{origin});assert.equal(result.body.success,true);
    assert.equal(w.aadhaarOptions,undefined);
    assert.equal(w.env.AADHAAR_REDIRECT_URL,"https://example.test/return");
  }
});

test("shared Aadhaar service always retains the configured return URL",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../services/digitapaadharservice.js"),"utf8");
  const fn=source.slice(source.indexOf("exports.initAadhaarKyc = async ("),source.indexOf("router.get("));
  const requests=[];const context={exports:{},crypto:require("crypto"),Buffer,console:{log(){},error(){}},process:{env:{AADHAAR_REDIRECT_URL:"https://example.test/original",DIGITAP_BASE_URL:"https://digitap.example.test",DIGITAP_CLIENT_ID:"test",DIGITAP_CLIENT_SECRET:"test"}},axios:{post:async(url,payload)=>{requests.push(payload);return {data:{model:{url:"https://kyc.example.test",unifiedTransactionId:"KYC1"}}};}}};
  vm.createContext(context);vm.runInContext(fn,context);
  const redirect="http://localhost:3000/arthavidhi-capital/new?lan=AVCL11000&step=address";
  assert.equal((await context.exports.initAadhaarKyc("AVCL11000","9876543210","","Test",{redirectionUrl:redirect})).success,true);
  assert.equal(requests[0].redirectionUrl,"https://example.test/original");
  await context.exports.initAadhaarKyc("CCB11000","9876543210","","Test",{redirectionUrl:redirect});
  assert.equal(requests[1].redirectionUrl,"https://example.test/original");
});

test("completed Aadhaar recovers a missed callback through the saved Digitap request without advancing the loan",async()=>{
  const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});await w.call("post","pan",{panNumber:"ABCDE1234F"});await w.call("post","aadhaar");
  w.setAadhaarResult({code:"200",model:{uniqueId:"AVCL11000_TEST",name:"VERIFIED CUSTOMER",dob:"03-02-1995",maskedAdharNumber:"XXXX XXXX 1234",address:{house:"12",street:"Main Road",vtc:"Mumbai",state:"Maharashtra",pc:"400001"}}});
  const result=await w.call("get","");assert.equal(result.body.data.aadhaarVerified,true);assert.equal(result.body.data.profile.dob,"1995-02-03");assert.equal(result.body.data.profile.customer_city,"Mumbai");assert.equal(result.body.data.profile.aadhaar_number,"XXXXXXXX1234");assert.equal(w.kyc.aadhaar_status,"VERIFIED");assert.equal(w.loan.status,"Draft");assert.ok(w.events.some(event=>event.startsWith("INSERT INTO arthavidhi_capital_audit")));
  const calls=w.events.filter(event=>event==="aadhaar-status-provider").length;await w.call("get","");assert.equal(w.events.filter(event=>event==="aadhaar-status-provider").length,calls);assert.equal(w.events.filter(event=>event==="aadhaar-provider").length,1);
});

test("Aadhaar refresh does not trust mismatched, incomplete, pending or unavailable provider results",async()=>{
  for(const response of [{code:"200",model:{uniqueId:"OTHER_CASE",name:"Other",dob:"03-02-1995",maskedAdharNumber:"XXXXXXXX1234",address:{city:"Mumbai"}}},{code:"200",model:{uniqueId:"AVCL11000_TEST"}},{code:"102",model:null},new Error("Provider timeout")]){
    const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});await w.call("post","pan",{panNumber:"ABCDE1234F"});await w.call("post","aadhaar");w.setAadhaarResult(response);
    const result=await w.call("get","");assert.equal(w.kyc.aadhaar_status,"INITIATED");assert.ok(!result.body.data?.aadhaarVerified);assert.ok(!w.events.some(event=>event.includes("SET aadhaar_status='VERIFIED'")));assert.equal(w.loan.status,"Draft");
  }
});

test("Digitap pending and unavailable details preserve the customer link and expose refresh diagnostics",async()=>{
  for(const httpStatus of [404,401,503]){
    const w=identityWorkflow();await w.call("post","otp/send",{mobile:"9876543210",consent:true});await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});await w.call("post","pan",{panNumber:"ABCDE1234F"});await w.call("post","aadhaar");
    w.setAadhaarResult(Object.assign(new Error("Private provider error"),{response:{status:httpStatus}}));
    const result=await w.call("get","");
    assert.equal(result.code,200);assert.equal(result.body.data.aadhaarVerified,false);
    assert.equal(result.body.data.kycUrl,"https://kyc.example.test/customer");
    assert.equal(result.body.data.aadhaarRefresh.success,false);
    assert.equal(result.body.data.aadhaarRefresh.provider_http_status,httpStatus);
    assert.equal(result.body.data.aadhaarRefresh.code,httpStatus===404?"DIGITAP_RESULT_PENDING":"DIGITAP_STATUS_UNAVAILABLE");
    assert.equal(w.kyc.aadhaar_status,"INITIATED");
    assert.equal(w.events.filter(event=>event==="aadhaar-provider").length,1);
  }
});


test("booking pulls bureau before policy evaluation and keeps provider failures visible",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const code=source.slice(source.indexOf("async function runArthavidhiBookingChecks("),source.indexOf("async function triggerArthavidhiCapitalBre("));
  for(const bureauStatus of ["VERIFIED","PENDING"]){
    const events=[],bureau={status:bureauStatus,score:bureauStatus==="VERIFIED"?710:null};
    const context={pullArthavidhiCapitalBureau:async()=>{events.push("bureau");return bureau;},runArthavidhiAml:async()=>{events.push("aml");return {status:"ERROR",reason:"Configure TW_API_TOKEN"};},triggerArthavidhiCapitalBre:async(lan,result)=>{assert.equal(result,bureau);events.push("bre");return {decision:"REVIEW",eligible:false};}};
    vm.runInNewContext(code,context);
    const result=await context.runArthavidhiBookingChecks("AVCL11000",{});
    assert.deepEqual(events,["bureau","aml","bre"]);assert.equal(result.bureau.status,bureauStatus);assert.equal(result.aml.status,"ERROR");assert.equal(result.bre.eligible,false);
  }
});

test("Review and Book retains the form and application for failed or pending checks",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../Frontend/src/components/ArthavidhiCapital/ArthavidhiCapitalLoanBooking.jsx"),"utf8");
  const code=source.slice(source.indexOf("  async function submit(e)"),source.indexOf('  return <section className="ym-page avcl-booking">'));
  for(const status of ["bre_rejected","policy_review","aml_review","bre_approved"]){
    const result={lan:"AVCL11000",status,bureau:{status:"PENDING"},bre:{decision:"REVIEW"}},state={};
    const context={busy:false,loadingDraft:false,activeSection:4,groups:[1,2,3,4],identity:{mobileVerified:true,panVerified:true,aadhaarVerified:true},formRef:{current:{querySelector:()=>null}},values:{requested_amount:"25000"},editingExisting:false,bookingLocked:false,
      assessmentPayload:()=>({}),persistDraft:async()=>"AVCL11000",api:{post:async()=>({data:{data:result}})},
      setBusy:()=>{},setError:value=>state.error=value,setBookingChecks:value=>state.checks=value,setDraftLan:value=>state.lan=value,setBookingLocked:()=>{},setEditingExisting:()=>{},setDraftNotice:()=>{},setActiveSection:value=>state.section=value,setCreated:value=>state.created=value,
    };
    vm.runInNewContext(code,context);
    await context.submit({preventDefault(){}});
    assert.equal(state.error,"");assert.equal(state.lan,"AVCL11000");
    if(status==="bre_approved")assert.equal(state.created,result);
    else{assert.equal(state.created,undefined);assert.equal(state.checks,result);assert.equal(state.section,4);}
  }
});


test("booking assessment validates fields, preserves unchanged review and invalidates changed sign-offs",()=>{
  const {mergeArthavidhiBookingAssessment:merge}=policyModule();
  const stored={monthly_revenue:50000,owned_residence:true,ho_review_by:"7",ho_foir_limit_percent:50,ho_review_notes:"Reviewed"};
  const unchanged=merge({monthly_revenue:"50000",owned_residence:true},JSON.stringify(stored));
  assert.equal(unchanged.ho_review_by,"7");
  const changed=merge({monthly_revenue:"60000",existing_monthly_obligations:"0",owned_business_premises:false},stored);
  assert.equal(changed.monthly_revenue,60000);assert.equal(changed.existing_monthly_obligations,0);assert.equal(changed.owned_business_premises,false);assert.equal(changed.ho_review_by,undefined);assert.equal(stored.ho_review_by,"7");
  for(const input of [{monthly_revenue:-1},{monthly_revenue:true},{monthly_revenue:"abc"},{monthly_revenue:"1.234"},{bank_statement_months:"6.5"},{owned_residence:"true"},{ho_foir_limit_percent:50},{score:800},{bureau_history_review_verified:true}])assert.throws(()=>merge(input));
});

test("BRE consumes saved booking facts and real bureau report; full credit approval remains separate",async()=>{
  const {evaluateStoredArthavidhiPolicy:evaluate}=policyModule();
  const loan={status:"Login",lan:"AVCL11000",age:30,requested_amount:30000,business_type:"Proprietorship",loan_tenure:12,interest:18,arthavidhi_capital_policy_inputs:{monthly_revenue:25000},aml_status:"PROCEED"};
  const report={score:710,report_xml:emptyProfile(710)};
  const bre=evaluate(loan,report,{breStage:true});
  assert.equal(bre.decision,"APPROVED");assert.equal(bre.eligibleAmount,30000);assert.equal(bre.pending.length,0);assert.ok(!bre.pending.some(code=>/BUSINESS|BANK|FOIR|VERIFICATION/.test(code)));
  assert.equal(evaluate(loan,report,{hoApproval:true}).eligible,true);
  assert.equal(evaluate(loan,null,{breStage:true}).eligible,false);
  assert.equal(evaluate(loan,{score:599,report_xml:emptyProfile(599)},{breStage:true}).decision,"REJECTED");
  let written;
  const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},query:async(sql,params)=>{if(sql.includes("SELECT * FROM"))return [[loan]];if(sql.includes("SELECT bureau_status"))return [[{bureau_status:"VERIFIED"}]];if(sql.includes("SELECT score,report_xml"))return [[report]];if(sql.startsWith("UPDATE")){written=params;return [{affectedRows:1}];}throw Error("Unexpected SQL");}};
  const engine=isolated("routes/ArthavidhiCapital/ArthavidhiCapitalBRE.js",{"../../config/db":{promise:()=>({getConnection:async()=>conn})},"../../services/arthavidhiDailySchedule":{buildMonthlySchedule},"fast-xml-parser":require("fast-xml-parser")});
  const result=await engine.autoRunArthavidhiCapitalBreIfReady(loan.lan);
  assert.equal(result.status,"bre_approved");assert.equal(written[0],"bre_approved");assert.equal(written[5],30000);assert.equal(JSON.parse(written[6]).assessmentStage,"BRE");
  const failedAttempt=await engine.autoRunArthavidhiCapitalBreIfReady(loan.lan,{bureauResult:{success:false,status:"PENDING"}});
  assert.equal(failedAttempt.status,"policy_review");assert.equal(written[0],"policy_review");assert.match(failedAttempt.reason,/Bureau verification/);
});

test("draft save persists assessment JSON and merges existing facts without provider calls",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const code=source.slice(source.indexOf("async function requireUniqueArthavidhiMobile("),source.indexOf("function amount("))+source.slice(source.indexOf("async function saveArthavidhiDraft("),source.indexOf("function arthavidhiCheckConfiguration("));
  let written;
  const existing={lan:"AVCL11000",partner_loan_id:"AVCLFL11000",status:"Draft",arthavidhi_capital_policy_inputs:JSON.stringify({monthly_revenue:50000,industry:"Retail"})};
  const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},query:async(sql,params)=>{if(sql.includes("GET_LOCK"))return [[{acquired:1}]];if(sql.startsWith("SELECT lan FROM"))return [[]];if(sql.includes("FOR UPDATE"))return [[existing]];if(sql.startsWith("UPDATE"))written={sql,params};return [{affectedRows:1}];}};
  const context={TABLE:"loan_booking_arthavidhi",db:{promise:()=>({getConnection:async()=>conn})},require:()=>policyModule(),amount:value=>Number(value).toFixed(2),bad:message=>{throw Error(message);},isoDate:value=>value,bookingFailure:error=>({status:400,message:error.message})};
  vm.runInNewContext(code,context);const res={status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await context.saveArthavidhiDraft({user:{id:7},body:{lan:existing.lan,mobile_number:"9876543210",login_date:"2026-10-28",business_vintage:"2",industry:"Retail",annual_turnover:"600000",assessment:{business_vintage_years:"2",existing_monthly_obligations:"0"}}},res);
  assert.equal(res.body.is_success,true);assert.equal(res.body.data.lan,existing.lan);
  const keys=[...written.sql.matchAll(/`([^`]+)`/g)].map(match=>match[1]);const saved=JSON.parse(written.params[keys.indexOf("arthavidhi_capital_policy_inputs")]);
  assert.equal(saved.monthly_revenue,50000);assert.equal(saved.business_vintage_years,2);assert.equal(saved.existing_monthly_obligations,0);
  assert.equal(written.params[keys.indexOf("business_vintage")],"2");assert.equal(written.params[keys.indexOf("annual_turnover")],"600000.00");
  assert.equal(completionHelpers.fromArthavidhiBookingRecord({arthavidhi_capital_policy_inputs:JSON.stringify(saved)}).monthly_revenue,50000);
});


test("synthetic UAT reports are labelled and cannot satisfy real approval gates",()=>{
  const engine=policyModule();
  const xml=emptyProfile(710,"ARTHAVIDHI_UAT_SYNTHETIC_BUREAU_V1: demo only; not provider verified");
  const loan={age:30,requested_amount:30000,loan_tenure:12,arthavidhi_capital_policy_inputs:{monthly_revenue:25000}};
  const result=engine.evaluateStoredArthavidhiPolicy(loan,{score:710,report_xml:xml},{breStage:true});
  assert.equal(result.eligible,true);assert.equal(result.synthetic,true);assert.equal(result.dataSource,"UAT_DEMO_NOT_PROVIDER_VERIFIED");
  assert.equal(result.pending.length,0);assert.equal(result.rejections.length,0);
  assert.throws(()=>completionHelpers.requireArthavidhiPolicyApproval({arthavidhi_capital_policy_result:{...result,ho_approved_by:"7"},tenure_unit:"months",repayment_frequency:"monthly"}),/policy and HO approval/);
  assert.equal(engine.evaluateStoredArthavidhiPolicy(loan,{score:710,report_xml:emptyProfile(710)}).synthetic,undefined);
});


test("credit approval opens the same LAN signing page only after API success, without a notes prompt",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../../Frontend/src/components/ArthavidhiCapital/ArthavidhiCapitalCreditTeam.jsx"),"utf8");
  const start=source.indexOf("async (row, decision) => {");
  const end=source.indexOf("    [navigate, refresh, setError]",start);
  const handler=source.slice(start,end).trim().replace(/,$/,"");
  for(const fail of [false,true]){
    const events=[];
    const context={window:{confirm(){throw Error("Approval must not prompt");},prompt(){throw Error("Approval must not ask for notes");}},setBusyLan:()=>{},setError:value=>events.push({error:value}),navigate:value=>events.push({navigate:value}),refresh:async()=>events.push({refresh:true}),api:{patch:async(url,payload)=>{assert.equal(payload.decision,"approve");assert.equal(payload.reason,"");if(fail)throw {response:{data:{message:"Case must be in the pre-credit review queue"}}};return {data:{success:true}};}}};
    vm.runInNewContext("globalThis.handleDecision="+handler,context);
    await context.handleDecision({lan:"AVCL11012"},"approve");
    if(fail){assert.ok(!events.some(event=>event.navigate));assert.ok(events.some(event=>event.error==="Case must be in the pre-credit review queue"));}
    else assert.ok(events.some(event=>event.navigate==="/arthavidhi-capital/signing?lan=AVCL11012"));
  }
});


test("verified mobiles cannot be re-sent OTP or claimed by another Arthavidhi case",async()=>{
  const w=identityWorkflow();
  await w.call("post","otp/send",{mobile:"9876543210",consent:true});
  const verified=await w.call("post","otp/verify",{mobile:"9876543210",otp:w.otp,consent:true});assert.equal(verified.body.mobileVerified,true);
  const before=w.loan.arthavidhi_capital_identity,count=w.events.filter(event=>event==="sms-provider").length;
  w.setElapsed(61);
  for(const mobile of ["9876543210","9876543211"]){const denied=await w.call("post","otp/send",{mobile,consent:true,restartIdentity:true});assert.equal(denied.code,409);assert.match(denied.body.message,/already verified/);}
  assert.equal(w.events.filter(event=>event==="sms-provider").length,count);assert.equal(w.loan.arthavidhi_capital_identity,before);
  const second=identityWorkflow();second.setDuplicateMobile("AVCL99999");
  const duplicate=await second.call("post","otp/send",{mobile:"9876543210",consent:true});assert.equal(duplicate.code,409);assert.ok(!second.events.includes("sms-provider"));
  const race=identityWorkflow();await race.call("post","otp/send",{mobile:"9876543210",consent:true});race.setDuplicateMobile("AVCL99999");
  assert.equal((await race.call("post","otp/verify",{mobile:"9876543210",otp:race.otp,consent:true})).code,409);
  assert.ok(!JSON.parse(race.loan.arthavidhi_capital_identity).mobile_verified_at);
});

test("draft duplicate-mobile check rejects before allocating an ID and always releases its mobile lock",async()=>{
  const source=fs.readFileSync(path.join(__dirname,"../routes/ArthavidhiCapital/ArthavidhiCapitalRoutes.js"),"utf8");
  const code=source.slice(source.indexOf("async function requireUniqueArthavidhiMobile("),source.indexOf("function amount("))+source.slice(source.indexOf("async function saveArthavidhiDraft("),source.indexOf("function arthavidhiCheckConfiguration("));
  const queries=[];const conn={query:async(sql)=>{queries.push(sql);if(sql.includes("GET_LOCK"))return [[{acquired:1}]];if(sql.startsWith("SELECT lan FROM"))return [[{lan:"AVCL11012"}]];if(sql.includes("RELEASE_LOCK"))return [[{released:1}]];throw Error("Unexpected write during duplicate check");},beginTransaction:async()=>{},rollback:async()=>{},release(){}};
  const context={TABLE:"loan_booking_arthavidhi",db:{promise:()=>({getConnection:async()=>conn})},bad:(message,status)=>{throw Object.assign(new Error(message),{status});},amount:v=>Number(v).toFixed(2),isoDate:v=>v,bookingFailure:e=>({status:e.status||500,message:e.message})};
  vm.runInNewContext(code,context);const res={status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await context.saveArthavidhiDraft({user:{id:7},body:{mobile_number:"9876543210",login_date:"2026-10-29"}},res);
  assert.equal(res.code,409);assert.match(res.body.message,/another Arthavidhi application/);assert.ok(queries.some(sql=>sql.includes("RELEASE_LOCK")));assert.ok(!queries.some(sql=>/INSERT|UPDATE/.test(sql)));
});

test("partner and internal credit queues are separate and require their assigned page permissions",async()=>{
  for(const [route,expected] of [["get /partner-credit-loans","bre_approved"],["get /credit-screen-loans","partner_approved"]]){
    const w=workflow();const result=await w.call(route);assert.equal(result.code,200);
    const list=w.reads.find(query=>query.sql.startsWith("SELECT * FROM loan_booking_arthavidhi WHERE"));assert.equal(Array.from(list.params[0]).join(","),expected);
    if(route==="get /partner-credit-loans"){assert.ok(list.sql.includes("aml_status"));assert.ok(list.sql.includes("k.bureau_status"));assert.ok(list.sql.includes("$.synthetic"));assert.ok(list.sql.includes("$.eligible"));}
    const denied=workflow({reviewPermission:false});assert.equal((await denied.call(route)).code,403);assert.ok(!denied.reads.some(query=>query.sql.startsWith("SELECT * FROM loan_booking")));
  }
  assert.equal((await workflow({reviewPermission:false}).call("patch /:lan/credit-decision",{decision:"approve"})).code,403);
  assert.equal((await workflow({reviewPermission:false}).call("patch /:lan/partner-review-decision",{decision:"approve"})).code,403);
});

function partnerReviewFixture(loan={}){
  return workflow({loan:{status:"bre_approved",requested_amount:30000,loan_amount:30000,loan_tenure:12,interest:18,interest_rate:18,processing_fee:100,arthavidhi_capital_final_offer:30000,arthavidhi_capital_bre_status:"BRE APPROVED",arthavidhi_capital_policy_result:JSON.stringify({eligible:true,eligibleAmount:30000}),...loan}});
}

test("partner approval hands reviewed terms to internal credit without changing original booking or provider facts",async()=>{
  const w=partnerReviewFixture();const terms={loan_amount:25000,loan_tenure:12,interest_rate:17,processing_fee:150};
  const result=await w.call("patch /:lan/partner-review-decision",{decision:"approve",terms},{user:{id:12,role:"Partner reviewer"}});
  assert.equal(result.code,200);assert.equal(result.body.data.status,"partner_approved");assert.ok(w.events.includes("commit"));
  const update=w.events.find(event=>event.sql?.includes("SET loan_amount=?,loan_tenure=?"));assert.equal(update.params[0],25000);assert.equal(update.params[4],"partner_approved");assert.equal(update.params[5],"partner_approved");assert.ok(!/requested_amount|customer_name|pan_number|mobile_number|aml_status|cibil_score/.test(update.sql));
  const policy=JSON.parse(update.params[6]);assert.equal(policy.synthetic,undefined);assert.equal(policy.partner_review.reviewed_by,"12");assert.equal(policy.partner_review.approved_amount,25000);
  const internal=workflow({loan:{status:"partner_approved",arthavidhi_capital_policy_result:update.params[6]}});
  assert.equal((await internal.call("patch /:lan/credit-decision",{decision:"approve"})).body.data.status,"credit_approved");
  const bypass=partnerReviewFixture();assert.equal((await bypass.call("patch /:lan/credit-decision",{decision:"approve"})).code,409);assert.ok(!bypass.events.some(event=>event.sql?.startsWith("UPDATE")));
});

test("partner may save terms or reject, but cannot review advanced cases or exceed the BRE offer",async()=>{
  const saved=partnerReviewFixture();assert.equal((await saved.call("patch /:lan/partner-review-decision",{decision:"save"})).body.data.status,"bre_approved");
  const rejected=partnerReviewFixture();assert.equal((await rejected.call("patch /:lan/partner-review-decision",{decision:"reject"})).code,400);assert.equal((await rejected.call("patch /:lan/partner-review-decision",{decision:"reject",reason:"Business profile not acceptable"})).body.data.status,"partner_rejected");assert.ok(rejected.events.includes("release-reservation"));
  for(const terms of [{loan_amount:31000},{loan_amount:9999},{loan_amount:25000,loan_tenure:18},{loan_tenure:0},{interest_rate:101},{processing_fee:30000},{mobile_number:"9876543211"}]){
    const w=partnerReviewFixture();assert.ok((await w.call("patch /:lan/partner-review-decision",{decision:"approve",terms})).code>=400);assert.ok(!w.events.some(event=>event.sql?.startsWith("UPDATE")));
  }
  for(const state of ["Draft","Login","policy_review","partner_approved","credit_approved","Disbursed"]){const w=partnerReviewFixture({status:state});assert.equal((await w.call("patch /:lan/partner-review-decision",{decision:"approve"})).code,409);}
});

test("Partner handoff requires real bureau verification, AML clearance and BRE approval",()=>{
 const engine=policyModule(),pass={eligible:true,decision:"APPROVED"};
 for(const aml of ["ERROR","PENDING","REVIEW",undefined]){const result=engine.getArthavidhiLoginDecision(pass,aml,"Token missing",true);assert.equal(result.status,"aml_review");assert.match(result.reason,/AML/);assert.match(result.reason,/Token missing/);}
 assert.equal(engine.getArthavidhiLoginDecision(pass,"STOP","Match",true).status,"aml_rejected");
 assert.equal(engine.getArthavidhiLoginDecision({eligible:false,decision:"REJECTED",reason:"DPD"},"PROCEED","",true).status,"bre_rejected");
 assert.equal(engine.getArthavidhiLoginDecision(pass,"PROCEED","",false).status,"policy_review");
 assert.equal(engine.getArthavidhiLoginDecision({...pass,synthetic:true},"PROCEED","",true).status,"policy_review");
 assert.equal(engine.getArthavidhiLoginDecision({eligible:false,decision:"REVIEW",reason:"Revenue missing"},"PROCEED","",true).status,"policy_review");
 assert.equal(engine.getArthavidhiLoginDecision(pass,"PROCEED","",true).status,"bre_approved");
});

test("stale bre_approved cases cannot bypass missing provider checks at partner approval",async()=>{
 for(const loan of [{aml_status:"ERROR",aml_reason:"Token missing"},{arthavidhi_capital_policy_result:JSON.stringify({eligible:true,synthetic:true})}]){
   const w=partnerReviewFixture(loan);const result=await w.call("patch /:lan/partner-review-decision",{decision:"approve"});assert.equal(result.code,409);assert.match(result.body.message,/cannot proceed/);assert.ok(!w.events.some(e=>e.sql?.startsWith("UPDATE")));
 }
});

test("revenue minimum and amount-based tenure boundaries reject invalid terms",()=>{
 const engine=policyModule(),bureau=engine.extractArthavidhiPolicyBureau({score:710,report_xml:emptyProfile(710)});
 const run=(amount,months,revenue)=>engine.evaluateArthavidhiCreditPolicy({loan:{age:30,requested_amount:amount,loan_tenure:months},bureau,assessment:{monthly_revenue:revenue}});
 assert.ok(run(25000,12,undefined).pending.includes("MONTHLY_REVENUE_MISSING"));
 assert.ok(run(25000,12,24999.99).rejections.includes("MONTHLY_REVENUE_BELOW_25000"));
 assert.equal(run(25000,12,25000).eligible,true);
 assert.ok(run(9999,6,25000).rejections.includes("LOAN_AMOUNT_BELOW_MINIMUM"));
 for(const [amount,min,max] of [[10000,6,12],[24999,6,12],[25000,6,12],[25001,9,18],[50000,9,18],[50001,12,18],[100000,12,18]]){
   for(const months of [min,max])assert.equal(run(amount,months,25000).eligible,true);
   for(const months of [min-1,max+1,min+0.5])assert.ok(run(amount,months,25000).rejections.includes("TENURE_OUTSIDE_AMOUNT_BAND"));
 }
});

test("shared payout service blocks Arthavidhi manual-payment cases before any DB or provider call",async()=>{
 const module={exports:{}};const exports=module.exports;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../services/payout.service.js"),"utf8"),{module,exports,require:()=>({}),process:{env:{}},console:{log(){},error(){}}});
 await assert.rejects(()=>exports.approveAndInitiatePayout({lan:"AVCL11000",table:"loan_booking_arthavidhi"}),error=>error.code==="ARTHAVIDHI_MANUAL_PAYMENT_ONLY");
});

test("shared eNACH route retains a single inline handler and Arthavidhi sends prepared payload",()=>{
 const source=fs.readFileSync(path.join(__dirname,"../routes/enachRoutes.js"),"utf8");
 assert.equal(source.split('router.post("/create-mandate",').length-1,1);
 assert.ok(source.includes('router.post("/create-mandate", authenticateUser, async (req, res) => {'));
 assert.ok(!source.includes("handleArthavidhiMandate"));assert.ok(!source.includes("router.createMandate ="));
 const frontend=fs.readFileSync(path.join(__dirname,"../../Frontend/src/components/ArthavidhiCapital/ArthavidhiCapitalActions.jsx"),"utf8");
 assert.ok(frontend.includes('api.post("/enach/create-mandate",prepared.data.data)'));
 assert.ok(frontend.includes("if(prepared.data.already_initiated)"));
});

function manualSettlement({loan:changes={},kyc:kycChanges={},signed=true,mandate="ACTIVE",legacyTransfer=false,legacyAttempt=false,conflict=false,limitValid=true,posBlocked=false,failWrite=""}={}){
 const events=[],utrs=[];
 const loan={lan:"AVCL11000",status:"disburse_initiate",ops_maker_id:"6",ops_checker_id:"7",loan_amount:20000,net_disbursement:19000,interest:18,loan_tenure:12,tenure_unit:"months",repayment_frequency:"monthly",aml_status:"PROCEED",account_number:"12345678901",ifsc:"HDFC0000001",emi_amount:1833.6,arthavidhi_capital_policy_result:JSON.stringify({eligible:true,ho_approved_by:"7"}),...changes};
 let savedRows=0,initial;
 const query=async(sql,params)=>{
  const text=sql.trim();events.push({sql:text,params});
  if(text.includes("GET_LOCK"))return [[{acquired:1}]];
  if(text.includes("RELEASE_LOCK"))return [[{released:1}]];
  if(text.startsWith("SELECT * FROM loan_booking"))return [[loan]];
  if(text.includes("FROM ev_disbursement_utr"))return [conflict?[{LAN:"AVCL99999",Disbursement_UTR:"MANUAL1"}]:utrs];
  if(text.includes("FROM kyc_verification_status"))return [[{pan_status:"VERIFIED",aadhaar_status:"VERIFIED",bureau_status:"VERIFIED",...kycChanges}]];
  if(text.includes("FROM esign_documents"))return [signed?[{id:1}]:[]];
  if(text.includes("FROM enach_mandates"))return [[{id:1,lan:loan.lan,document_id:"M1",status:mandate,umrn:"UMRN1",account_no:loan.account_number,ifsc:loan.ifsc,mandate_amount:2000}]];
  if(text.includes("FROM quick_transfers"))return [legacyTransfer?[{id:1}]:[]];
  if(text.includes("FROM arthavidhi_capital_payout_attempts"))return [legacyAttempt?[{request_id:"old"}]:[]];
  if(text.startsWith("SELECT id")&&text.includes("manual_rps"))return [savedRows?[{id:1}]:[]];
  if(failWrite&&text.startsWith(failWrite))throw Error("Simulated database failure");
  if(text.startsWith("INSERT INTO manual_rps"))savedRows=params[0].length;
  if(text.startsWith("INSERT INTO ev_disbursement_utr"))utrs.push({LAN:params[0],Disbursement_UTR:params[1]});
  if(text.startsWith("UPDATE loan_booking")&&text.includes("status='Disbursed'"))loan.status="Disbursed";
  return [{affectedRows:1}];
 };
 const conn={query,beginTransaction:async()=>{initial={status:loan.status,rows:savedRows,utrs:utrs.length};events.push("begin");},commit:async()=>events.push("commit"),rollback:async()=>{if(initial){loan.status=initial.status;savedRows=initial.rows;utrs.length=initial.utrs;}events.push("rollback");},release:()=>events.push("release")};
 const api=isolated("services/processArthavidhiCapitalDisbursement.js",{
  "./ArthavidhiCapitalAgreementStatus":completionHelpers,"../config/db":{promise:()=>({getConnection:async()=>conn})},"crypto":require("node:crypto"),
  "./arthavidhiDailySchedule":{generateRepaymentScheduleArthavidhiCapital},
  "./partnerLimitService":{checkPartnerPosGate:async()=>({blocked:posBlocked}),getOrCreatePartner:async()=>({partner_id:1}),validatePartnerDisbursementLimit:async()=>({valid:limitValid,limitId:1}),updateDisbursedLimit:async()=>events.push("disbursement-limit")},
  "../utils/partnerHelpers":{getMonthYear:()=>({month:10,year:2026})},
  "../routes/ArthavidhiCapital/arthavidhiWebhook":{sendArthavidhiWebhook:async(lan,event,payload)=>{events.push({notification:payload});events.push("webhook");}},
 });
 return {loan,utrs,events,get savedRows(){return savedRows;},run:overrides=>api.processArthavidhiCapitalDisbursement({lan:"AVCL11000",disbursementUTR:"MANUAL1",disbursementDate:"2026-10-22",mode:"MANUAL",actorId:"8",...overrides})};
}

test("manual UTR saves monthly RPS, disburses and sends webhook after commit without provider payout",async()=>{
 const w=manualSettlement();const result=await w.run();assert.equal(result.success,true);assert.equal(w.savedRows,12);assert.equal(w.loan.status,"Disbursed");assert.equal(w.utrs[0].Disbursement_UTR,"MANUAL1");
 assert.ok(w.events.indexOf("commit")<w.events.indexOf("webhook"));assert.ok(w.events.indexOf("release")<w.events.indexOf("webhook"));
 const audit=w.events.find(e=>e.sql?.startsWith("INSERT INTO arthavidhi_capital_audit"));assert.equal(audit.params[1],"8");assert.equal(JSON.parse(audit.params[2]).payment_mode,"MANUAL");
 const notify=w.events.find(e=>e.notification);assert.equal(notify.notification.payment_mode,"MANUAL");assert.equal(notify.notification.utr,"MANUAL1");
 assert.ok(!w.events.some(e=>e.sql?.startsWith("INSERT INTO quick_transfers")));assert.ok(!w.events.some(e=>e.sql?.startsWith("UPDATE arthavidhi_capital_payout_attempts")));
 const replay=await w.run();assert.equal(replay.skipped,true);assert.equal(w.savedRows,12);assert.equal(w.events.filter(e=>e==="webhook").length,1);assert.equal(w.events.filter(e=>e==="disbursement-limit").length,1);
});

test("manual UTR blocks incomplete approval/provider checks, legacy payouts and conflicting UTRs",async()=>{
 for(const options of [{loan:{status:"approved"}},{loan:{status:"Draft"}},{loan:{ops_checker_id:null}},{loan:{ops_maker_id:"7"}},{loan:{aml_status:"ERROR"}},{loan:{net_disbursement:0}},{loan:{arthavidhi_capital_policy_result:JSON.stringify({eligible:true,synthetic:true,ho_approved_by:"7"})}},{kyc:{bureau_status:"PENDING"}},{kyc:{pan_status:"PENDING"}},{signed:false},{mandate:"PENDING"},{legacyTransfer:true},{legacyAttempt:true},{conflict:true},{limitValid:false},{posBlocked:true}]){
  const w=manualSettlement(options);await assert.rejects(()=>w.run());assert.equal(w.loan.status,options.loan?.status||"disburse_initiate");assert.equal(w.savedRows,0);assert.equal(w.utrs.length,0);assert.ok(!w.events.includes("commit"));assert.ok(!w.events.includes("webhook"));
 }
 for(const override of [{actorId:null},{disbursementDate:"not-a-date"},{disbursementDate:"2099-01-01"}])await assert.rejects(()=>manualSettlement().run(override));
});

test("manual UTR transaction rolls back RPS and state if any persistence step fails",async()=>{
 for(const failWrite of ["INSERT INTO manual_rps","INSERT INTO ev_disbursement_utr","UPDATE loan_booking_arthavidhi SET status","INSERT INTO arthavidhi_capital_audit"]){
  const w=manualSettlement({failWrite});await assert.rejects(()=>w.run());assert.equal(w.loan.status,"disburse_initiate");assert.equal(w.savedRows,0);assert.equal(w.utrs.length,0);assert.ok(w.events.includes("rollback"));assert.ok(!w.events.includes("commit"));assert.ok(!w.events.includes("webhook"));
 }
});

test("AVCL UTR upload requires staff permission and dispatches only to manual settlement",async()=>{
 const serial=(Date.UTC(2026,9,22)-Date.UTC(1899,11,30))/86400000;
 for(const scenario of ["unauthenticated","forbidden","manual","duplicate","settlement-error","other-product"]){
  const sheet=[{LAN:scenario==="other-product"?"YAM11000":"AVCL11000","Disbursement UTR":"BANK1","Disbursement Date":serial}];
  let handler,authCalls=0,manualCalls=0;const events=[];
  const route={post:(path,upload,fn)=>{handler=fn;},get(){}};
  isolated("routes/utrRoutes.js",{
   "express":{Router:()=>route},"multer":()=>({single:()=>()=>{}}),"xlsx":{read:()=>({SheetNames:["Sheet1"],Sheets:{Sheet1:{}}}),utils:{sheet_to_json:()=>sheet}},
   "../config/db":{promise:()=>({query:async(sql)=>{events.push(sql);if(sql.includes("FROM pages p"))return [scenario==="forbidden"?[]:[{id:1}]];return [[]];}})},
   "../utils/webhook":{},"../utils/repaymentScheduleGenerator":{generateRepaymentSchedule:()=>{throw Error("AVCL must not use the unguarded generic path");}},
   "../services/partnerLimitService":{},"../services/partnerFldgService":{},"../utils/partnerHelpers":{},"../services/processEmiClub2Disbursement":{},
   "../services/welcomeLetterService":{sendWelcomeLetterAfterUtrUpload:async()=>({recipient:"test@example.test"})},
   "../middleware/verifyToken":(req,res,next)=>{authCalls++;if(scenario==="unauthenticated")return res.status(401).json({message:"No token"});req.user={id:8,role:"Ops"};next();},
   "../services/processArthavidhiCapitalDisbursement":{processArthavidhiCapitalDisbursement:async input=>{manualCalls++;assert.equal(input.mode,"MANUAL");assert.equal(input.actorId,8);assert.equal(input.disbursementUTR,"BANK1");if(scenario==="settlement-error")throw Error("Checker approval missing");return {success:true,skipped:scenario==="duplicate"};}},
  });
  const res={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({file:{buffer:Buffer.from("mock-sheet")},headers:{}},res);
  if(scenario==="unauthenticated"||scenario==="forbidden"){assert.equal(res.code,scenario==="unauthenticated"?401:403);assert.equal(manualCalls,0);assert.ok(!events.some(sql=>/INSERT|UPDATE/.test(sql)));}
  else if(scenario==="other-product"){assert.equal(authCalls,0);assert.equal(manualCalls,0);}
  else{assert.equal(manualCalls,1);assert.equal(res.body.processed_count,scenario==="manual"?1:0);if(scenario==="settlement-error")assert.match(res.body.row_errors[0].reason,/Checker approval missing/);if(scenario==="duplicate")assert.equal(res.body.duplicate_utr[0],"BANK1");}
 }
});
