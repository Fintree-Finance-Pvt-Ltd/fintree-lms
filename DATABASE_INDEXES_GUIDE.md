# Database Indexes - Complete Guide for Dashboard Performance

## 🎯 Why Indexes Matter
- **Without indexes**: Database scans entire table (slow for millions of rows)
- **With indexes**: Database jumps directly to rows matching criteria (10-100x faster)
- **Impact**: The single biggest performance improvement you can make

---

## 📋 Index Creation Script

### Run this in MySQL/MariaDB to create all necessary indexes:

```sql
-- ============================================================================
-- PHASE 1: Core Indexes on Primary Lookup Keys
-- ============================================================================

-- loan_bookings table
CREATE INDEX idx_loan_bookings_lan ON loan_bookings(lan);
CREATE INDEX idx_loan_bookings_agreement_date ON loan_bookings(agreement_date);
CREATE INDEX idx_loan_bookings_status ON loan_bookings(status);

-- loan_booking_ev table
CREATE INDEX idx_loan_booking_ev_lan ON loan_booking_ev(lan);
CREATE INDEX idx_loan_booking_ev_agreement_date ON loan_booking_ev(agreement_date);
CREATE INDEX idx_loan_booking_ev_status ON loan_booking_ev(status);

-- loan_booking_adikosh table
CREATE INDEX idx_loan_booking_adikosh_lan ON loan_booking_adikosh(lan);
CREATE INDEX idx_loan_booking_adikosh_agreement_date ON loan_booking_adikosh(agreement_date);
CREATE INDEX idx_loan_booking_adikosh_status ON loan_booking_adikosh(status);

-- loan_booking_gq_non_fsf table
CREATE INDEX idx_loan_booking_gq_non_fsf_lan ON loan_booking_gq_non_fsf(lan);
CREATE INDEX idx_loan_booking_gq_non_fsf_agreement_date ON loan_booking_gq_non_fsf(agreement_date);

-- loan_booking_gq_fsf table
CREATE INDEX idx_loan_booking_gq_fsf_lan ON loan_booking_gq_fsf(lan);
CREATE INDEX idx_loan_booking_gq_fsf_agreement_date ON loan_booking_gq_fsf(agreement_date);

-- ============================================================================
-- PHASE 2: Indexes on RPS (Manual Repayment Schedule) tables
-- ============================================================================

-- manual_rps_bl_loan
CREATE INDEX idx_manual_rps_bl_lan ON manual_rps_bl_loan(lan);
CREATE INDEX idx_manual_rps_bl_payment_date ON manual_rps_bl_loan(payment_date);
CREATE INDEX idx_manual_rps_bl_due_date ON manual_rps_bl_loan(due_date);
CREATE INDEX idx_manual_rps_bl_status ON manual_rps_bl_loan(status);

-- manual_rps_ev_loan
CREATE INDEX idx_manual_rps_ev_lan ON manual_rps_ev_loan(lan);
CREATE INDEX idx_manual_rps_ev_payment_date ON manual_rps_ev_loan(payment_date);
CREATE INDEX idx_manual_rps_ev_due_date ON manual_rps_ev_loan(due_date);
CREATE INDEX idx_manual_rps_ev_status ON manual_rps_ev_loan(status);

-- manual_rps_adikosh
CREATE INDEX idx_manual_rps_adikosh_lan ON manual_rps_adikosh(lan);
CREATE INDEX idx_manual_rps_adikosh_payment_date ON manual_rps_adikosh(payment_date);
CREATE INDEX idx_manual_rps_adikosh_due_date ON manual_rps_adikosh(due_date);
CREATE INDEX idx_manual_rps_adikosh_status ON manual_rps_adikosh(status);

-- manual_rps_gq_non_fsf
CREATE INDEX idx_manual_rps_gq_non_fsf_lan ON manual_rps_gq_non_fsf(lan);
CREATE INDEX idx_manual_rps_gq_non_fsf_payment_date ON manual_rps_gq_non_fsf(payment_date);
CREATE INDEX idx_manual_rps_gq_non_fsf_status ON manual_rps_gq_non_fsf(status);

-- manual_rps_gq_fsf
CREATE INDEX idx_manual_rps_gq_fsf_lan ON manual_rps_gq_fsf(lan);
CREATE INDEX idx_manual_rps_gq_fsf_payment_date ON manual_rps_gq_fsf(payment_date);

-- ============================================================================
-- PHASE 3: Indexes on Repayments Data
-- ============================================================================

-- repayments_upload
CREATE INDEX idx_repayments_upload_lan ON repayments_upload(lan);
CREATE INDEX idx_repayments_upload_payment_date ON repayments_upload(payment_date);

-- repayments_upload_adikosh
CREATE INDEX idx_repayments_upload_adikosh_payment_date ON repayments_upload_adikosh(payment_date);

-- ============================================================================
-- PHASE 4: Composite Indexes for Common Query Patterns
-- ============================================================================
-- These are CRITICAL for performance! They cover multiple columns in one index

-- Most common pattern: Join on LAN + Filter by date
CREATE INDEX idx_loan_bookings_lan_agreement ON loan_bookings(lan, agreement_date);
CREATE INDEX idx_loan_booking_ev_lan_agreement ON loan_booking_ev(lan, agreement_date);
CREATE INDEX idx_repayments_upload_lan_payment ON repayments_upload(lan, payment_date);

-- RPS queries: LAN + Status + Date filtering
CREATE INDEX idx_manual_rps_bl_lan_status_due ON manual_rps_bl_loan(lan, status, due_date);
CREATE INDEX idx_manual_rps_ev_lan_status_due ON manual_rps_ev_loan(lan, status, due_date);
CREATE INDEX idx_manual_rps_bl_status_payment ON manual_rps_bl_loan(status, payment_date);

-- Allocation table (if used)
CREATE INDEX idx_allocation_lan ON allocation(lan);
CREATE INDEX idx_allocation_charge_type ON allocation(charge_type);

-- ============================================================================
-- PHASE 5: Verification and Optimization
-- ============================================================================

-- Analyze all tables after creating indexes
ANALYZE TABLE loan_bookings;
ANALYZE TABLE loan_booking_ev;
ANALYZE TABLE loan_booking_adikosh;
ANALYZE TABLE loan_booking_gq_non_fsf;
ANALYZE TABLE loan_booking_gq_fsf;
ANALYZE TABLE manual_rps_bl_loan;
ANALYZE TABLE manual_rps_ev_loan;
ANALYZE TABLE manual_rps_adikosh;
ANALYZE TABLE manual_rps_gq_non_fsf;
ANALYZE TABLE manual_rps_gq_fsf;
ANALYZE TABLE repayments_upload;
ANALYZE TABLE repayments_upload_adikosh;
ANALYZE TABLE allocation;

-- Optimize all tables to rebuild statistics
OPTIMIZE TABLE loan_bookings;
OPTIMIZE TABLE loan_booking_ev;
OPTIMIZE TABLE loan_booking_adikosh;
OPTIMIZE TABLE manual_rps_bl_loan;
OPTIMIZE TABLE manual_rps_ev_loan;
OPTIMIZE TABLE manual_rps_adikosh;
OPTIMIZE TABLE repayments_upload;
OPTIMIZE TABLE repayments_upload_adikosh;
```

---

## ⚡ Quick Performance Check

Before and after running indexes, execute these queries to see improvement:

```sql
-- Check if indexes are being used
EXPLAIN SELECT SUM(loan_amount) 
FROM loan_bookings 
WHERE agreement_date >= '2025-01-01' AND agreement_date < '2025-02-01';

-- Check current indexes on table
SHOW INDEX FROM loan_bookings;

-- Get table statistics
SELECT table_name, table_rows, data_length 
FROM information_schema.tables 
WHERE table_schema = 'your_database_name';
```

---

## 📊 Expected Query Performance After Indexes

| Query Type | Before Index | After Index | Speedup |
|-----------|-------------|------------|---------|
| Disbursal trend (sum by date) | 2-3 sec | 100-200 ms | **15-30x** |
| Repayment trend (join + sum) | 3-4 sec | 150-300 ms | **10-25x** |
| DPD bucket calculation | 4-5 sec | 200-400 ms | **10-20x** |
| Collection vs Due | 5-6 sec | 300-500 ms | **10-18x** |

---

## 🔍 Top 5 Most Critical Indexes (If limited on time)

If you can only create a few indexes, prioritize these:

```sql
-- These 5 will give 80% of the improvement
CREATE INDEX idx_loan_bookings_lan_agreement ON loan_bookings(lan, agreement_date);
CREATE INDEX idx_manual_rps_bl_lan_status_due ON manual_rps_bl_loan(lan, status, due_date);
CREATE INDEX idx_repayments_upload_lan_payment ON repayments_upload(lan, payment_date);
CREATE INDEX idx_loan_bookings_status ON loan_bookings(status);
CREATE INDEX idx_manual_rps_bl_payment_date ON manual_rps_bl_loan(payment_date);
```

**Time to create**: ~5 minutes
**Expected improvement**: **60-70% faster** queries

---

## 📈 Implementation Phases

### Phase 1: Emergency (5 minutes)
- Create 5 critical composite indexes listed above
- Run ANALYZE on all tables
- **Expected gain: 60-70%**

### Phase 2: Standard (15 minutes)
- Create all Phase 1 + Phase 2 indexes
- Run OPTIMIZE on all tables
- **Expected gain: 80-85%**

### Phase 3: Complete (30 minutes)
- Create all indexes from all phases
- Full ANALYZE + OPTIMIZE cycle
- **Expected gain: 90-95%**

---

## ⚠️ Important Notes

1. **Index Creation Impact**:
   - Creating indexes locks the table briefly
   - Schedule during low-traffic hours
   - For large tables, use `ALGORITHM=INPLACE, LOCK=NONE`

2. **Storage Cost**:
   - Each index uses about 10-20% of table size
   - Not a significant concern for most systems
   - Trade off storage for speed (worth it!)

3. **Write Performance**:
   - Indexes slow down INSERT/UPDATE operations slightly
   - Much slower queries get much faster
   - Net benefit is **always positive** for read-heavy dashboards

4. **Monitoring**:
   - Check MySQL slow query log regularly
   - Use `EXPLAIN` to verify index usage
   - Run `ANALYZE` monthly for optimal performance

---

## 🧪 Testing Script

Create and monitor a test to measure improvements:

```javascript
// Add this to dashboardRoutes.js for performance monitoring
async function queryPerformance(sqlQuery, params, label) {
  const startTime = Date.now();
  const [result] = await db.promise().query(sqlQuery, params);
  const duration = Date.now() - startTime;
  
  console.log(`⏱️  [${label}] Completed in ${duration}ms`);
  
  // Alert if query is slow
  if (duration > 1000) {
    console.warn(`⚠️  SLOW QUERY [${label}]: ${duration}ms`);
  }
  
  return result;
}
```

Use it like:
```javascript
const rows = await queryPerformance(sql, params, "Metric Cards Query");
```

---

## 🎓 Index Best Practices

1. **Use COMPOSITE indexes** for multi-column filters
2. **Always include JOIN keys** in indexes
3. **Filter columns before date ranges** in composite indexes
4. **Avoid too many indexes** (5-8 per table is typical)
5. **Monitor index usage** with `SHOW INDEX` and `EXPLAIN`

---

## 📞 Need Help?

Run this to see index usage:
```sql
-- Check if an index is being used
SELECT object_schema, object_name, count_read, count_write, count_delete, count_update
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE object_schema != 'mysql'
ORDER BY count_read DESC;
```

If an index has `count_read = 0`, it's not being used and can be deleted.
