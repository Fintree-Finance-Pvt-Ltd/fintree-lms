const limits = require("./partnerLimitService");
const fldg = require("./partnerFldgService");
// Caller holds the loan row lock; release the ORIGINAL reservation, even if
// credit approved a lower amount. Services retain their existing audit trail.
async function releaseArthavidhiReservations(conn, lan) {
  if (!/^AVCL\d+$/.test(lan)) throw new Error("Invalid Arthavidhi LAN");
  const [bookings] = await conn.query(`SELECT a.partner_id,a.month,a.year,
    SUM(CASE WHEN a.action_type='BOOKED' THEN a.loan_amount WHEN a.action_type IN ('REJECTED','CANCELLED') THEN -a.loan_amount ELSE 0 END) AS loan_amount,m.id AS limit_id
    FROM partner_limit_audit a JOIN partner_monthly_limit m
    ON m.partner_id=a.partner_id AND m.month=a.month AND m.year=a.year
    WHERE a.booking_lan=? GROUP BY a.partner_id,a.month,a.year,m.id`,[lan]);
  for (const row of bookings) if(Number(row.loan_amount)>0) {
    await conn.query("SELECT id FROM partner_monthly_limit WHERE id=? FOR UPDATE",[row.limit_id]);
    await conn.query("UPDATE partner_monthly_limit SET booked_limit=GREATEST(booked_limit-?,0),updated_at=NOW() WHERE id=?",[row.loan_amount,row.limit_id]);
    await conn.query("INSERT INTO partner_limit_audit (partner_id,booking_lan,loan_amount,month,year,action_type) VALUES (?,?,?,?,?,'REJECTED')",[row.partner_id,lan,row.loan_amount,row.month,row.year]);
  }
  const [reservations] = await conn.query(`SELECT partner_id,
    SUM(CASE WHEN utilization_type IN ('RESERVED','CONSUMED') THEN amount WHEN utilization_type='RELEASED' THEN -amount ELSE 0 END) AS remaining
    FROM partner_fldg_utilization WHERE booking_lan=? GROUP BY partner_id`,[lan]);
  for (const row of reservations) if (Number(row.remaining)>0) await fldg.releaseFldg(conn,row.partner_id,lan,row.remaining,"Arthavidhi rejection");
}

// Technical retries keep the original LAN and reacquire any reservation released
// by the missing-score rejection. Caller holds the booking row lock.
async function restoreArthavidhiReservations(conn,loan) {
  if(!/^AVCL\d+$/.test(loan.lan))throw new Error("Invalid Arthavidhi LAN");
  const [[original]]=await conn.query("SELECT partner_id,month,year FROM partner_limit_audit WHERE booking_lan=? AND action_type='BOOKED' ORDER BY id LIMIT 1",[loan.lan]);
  if(!original)throw Object.assign(new Error("Original booking reservation is missing; administrator review required"),{status:409});
  const [[balance]]=await conn.query("SELECT COALESCE(SUM(CASE WHEN action_type='BOOKED' THEN loan_amount WHEN action_type IN ('REJECTED','CANCELLED') THEN -loan_amount ELSE 0 END),0) AS amount FROM partner_limit_audit WHERE booking_lan=?",[loan.lan]);
  const amount=Number(loan.requested_amount??loan.loan_amount),missing=Math.max(0,amount-Number(balance.amount));
  if(missing>0){
    const limit=await limits.validatePartnerBookingLimit(conn,original.partner_id,missing,original.month,original.year);
    if(!limit.valid)throw Object.assign(new Error(limit.message||"Booking limit unavailable for retry"),{status:409});
    await conn.query("UPDATE partner_monthly_limit SET booked_limit=booked_limit+?,updated_at=NOW() WHERE id=?",[missing,limit.limitId]);
    await conn.query("INSERT INTO partner_limit_audit (partner_id,booking_lan,loan_amount,month,year,action_type) VALUES (?,?,?,?,?,'BOOKED')",[original.partner_id,loan.lan,missing,original.month,original.year]);
  }
  const [[config]]=await conn.query("SELECT fldg_status,fldg_percent FROM partner_master WHERE partner_id=? FOR UPDATE",[original.partner_id]);
  if(!config)throw Object.assign(new Error("Partner configuration missing"),{status:409});
  const [[held]]=await conn.query("SELECT COALESCE(SUM(CASE WHEN utilization_type IN ('RESERVED','CONSUMED') THEN amount WHEN utilization_type='RELEASED' THEN -amount ELSE 0 END),0) AS amount FROM partner_fldg_utilization WHERE booking_lan=? AND partner_id=?",[loan.lan,original.partner_id]);
  const required=Number(config.fldg_status)===1?Math.round(amount*Number(config.fldg_percent))/100:0;
  const missingFldg=Math.max(0,required-Number(held.amount));
  if(missingFldg>0){
    const check=await fldg.validateFldgAvailability(conn,original.partner_id,missingFldg);
    if(!check.valid)throw Object.assign(new Error("Insufficient FLDG availability for retry"),{status:409});
    await fldg.reserveFldg(conn,original.partner_id,loan.lan,missingFldg,"Arthavidhi technical bureau retry");
  }
}
module.exports={releaseArthavidhiReservations,restoreArthavidhiReservations};
