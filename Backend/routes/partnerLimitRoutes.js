const express = require("express");
const db = require("../config/db");
const partnerLimitService = require("../services/partnerLimitService");

const router = express.Router();

const RPS_POS_SOURCES = [
  {
    partnerName: "Circle Pe Houser",
    tableName: "manual_rps_circle_pe_houser",
  },
  {
    partnerName: "Circle Pe",
    tableName: "manual_rps_circlepe",
  },
  {
    partnerName: "Motion Corp",
    tableName: "manual_rps_motioncorp",
  },
  {
    partnerName: "Sampada",
    tableName: "manual_rps_sampada",
  },
  {
    partnerName: "Adikosh",
    tableName: "manual_rps_adikosh",
  },
  {
    partnerName: "BL Loan",
    tableName: "manual_rps_bl_loan",
  },
  {
    partnerName: "GQ FSF",
    tableName: "manual_rps_gq_fsf",
  },
  {
    partnerName: "GQ NON FSF",
    tableName: "manual_rps_gq_non_fsf",
  },
  {
    partnerName: "Hey EV Loan",
    tableName: "manual_rps_hey_ev",
  },
  {
    partnerName: "HeyEV Battery",
    tableName: "manual_rps_hey_ev_battery",
  },
  {
    partnerName: "WCTL",
    tableName: "manual_rps_wctl",
  },
  {
    partnerName: "EV Loan",
    tableName: "manual_rps_ev_loan",
  },
  {
    partnerName: "HELIUM",
    tableName: "manual_rps_helium",
  },
  {
    partnerName: "Finso",
    tableName: "manual_rps_finso_loan",
  },
  {
    partnerName: "EMICLUB",
    tableName: "manual_rps_emiclub",
  },
  {
    partnerName: "Loan Digit",
    tableName: "manual_rps_loan_digit",
  },
  {
    partnerName: "CLAYOO",
    tableName: "manual_rps_clayoo",
  },
   {
    partnerName: "SRBH",
    tableName: "manual_rps_srbh",
  },
   {
    partnerName: "SASWAT",
    tableName: "manual_rps_saswat",
  },
  {
    partnerName: "CAREPAY",
    tableName: "manual_rps_carepay",
  },
  {
    partnerName: "Claim Cure Buddy",
    tableName: "manual_rps_claim_cure_buddy",
  },
  {
    partnerName: "QUICK MONEY",
    tableName: "manual_rps_quick_money",
  },
  {
    partnerName: "RAPID MONEY",
    tableName: "manual_rps_switch_my_loan",
  },
  {
    partnerName: "Seven Fincorp",
    tableName: "manual_rps_seven_fincorp",
  },
  {
    partnerName: "sterlion-ubl",
    tableName: "manual_rps_sterlion_ubl",
  },
  {
    partnerName: "WCTL FFPL",
    tableName: "manual_rps_wctl_ffpl",
  },
  {
    partnerName: "YAMONEY",
    tableName: "manual_rps_ya_money",
  },
];

async function getPartnerPOSMap(conn) {
  const posMap = {};
  const posErrors = [];

  for (const source of RPS_POS_SOURCES) {
    try {
      const [rows] = await conn.query(
        `
        SELECT 
          COALESCE(SUM(COALESCE(remaining_principal, 0)), 0) AS pos
        FROM ${source.tableName}
        WHERE COALESCE(remaining_principal, 0) > 0
        `,
      );

      posMap[source.partnerName.toLowerCase()] = Number(rows[0]?.pos || 0);
    } catch (err) {
      console.error(
        `POS query failed for ${source.partnerName} / ${source.tableName}:`,
        err.message,
      );

      posErrors.push({
        partnerName: source.partnerName,
        tableName: source.tableName,
        error: err.message,
      });

      posMap[source.partnerName.toLowerCase()] = 0;
    }
  }

  return { posMap, posErrors };
}

router.get("/partners-list", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        partner_id,
        partner_name,
        status,
        fldg_percent,
        fldg_status
      FROM partner_master
      ORDER BY partner_name
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch partners",
      error: err.message,
    });
  }
});

router.put("/:partnerId/fldg", async (req, res) => {
  try {
    const { partnerId } = req.params;

    const { fldg_percent, fldg_status } = req.body;

    await db.promise().query(
      `
      UPDATE partner_master
      SET
        fldg_percent = ?,
        fldg_status = ?
      WHERE partner_id = ?
      `,
      [fldg_percent, fldg_status, partnerId],
    );

    res.json({
      message: "FLDG updated successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: "Update failed",
      error: err.message,
    });
  }
});

router.put("/:partnerId/status", async (req, res) => {
  try {
    const { partnerId } = req.params;

    const { status } = req.body;

    await db.promise().query(
      `
      UPDATE partner_master
      SET status = ?
      WHERE partner_id = ?
      `,
      [status, partnerId],
    );

    res.json({
      message: "Partner status updated",
    });
  } catch (err) {
    res.status(500).json({
      message: "Status update failed",
      error: err.message,
    });
  }
});

// GET /api/partners - List all partners with current monthly limits
router.get("/partners", async (req, res) => {
  const conn = await db.promise().getConnection();

  try {
    const { month, year } = req.query;

    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const [partners] = await conn.query(
      `
      SELECT
        pm.partner_id,
        pm.partner_name,
        pm.status,
        pm.fldg_percent,
        pm.fldg_status,
        pm.pos_limit,
        pml.id AS limit_id,
        COALESCE(pml.assigned_limit, 0) AS assigned_limit,
        COALESCE(pml.booked_limit, 0) AS booked_limit,
        COALESCE(pml.used_limit, 0) AS used_limit,
         COALESCE(pml.assigned_limit, 0) - COALESCE(pml.used_limit, 0) 
      AS remaining_limit,

    COALESCE(pml.assigned_limit, 0) - COALESCE(pml.booked_limit, 0)
      AS booking_remaining_limit,

    COALESCE(pml.booked_limit, 0) - COALESCE(pml.used_limit, 0)
      AS pending_pipeline,
        pml.month,
        pml.year
      FROM partner_master pm
      LEFT JOIN partner_monthly_limit pml 
        ON pm.partner_id = pml.partner_id 
        AND pml.month = ? 
        AND pml.year = ?
      ORDER BY pm.partner_name
      `,
      [m, y],
    );

    const { posMap, posErrors } = await getPartnerPOSMap(conn);

    const partnersWithPOS = partners.map((p) => ({
      ...p,
      pos: Number(posMap[String(p.partner_name || "").toLowerCase()] || 0),
    }));

    const totals = partnersWithPOS.reduce(
      (acc, p) => {
        acc.assigned_limit += Number(p.assigned_limit || 0);
        acc.used_limit += Number(p.used_limit || 0);
        acc.remaining_limit += Number(p.remaining_limit || 0);
        acc.booking_remaining_limit += Number(p.booking_remaining_limit || 0);
        acc.pending_pipeline += Number(p.pending_pipeline || 0);
        acc.pos += Number(p.pos || 0);
        return acc;
      },
      {
        assigned_limit: 0,
        used_limit: 0,
        remaining_limit: 0,
        booking_remaining_limit: 0,
        pending_pipeline: 0,
        pos: 0,
      },
    );

    res.json({
      month: m,
      year: y,
      partners: partnersWithPOS,
      totals,
    });
  } catch (err) {
    console.error("Partner list error:", err);

    res.status(500).json({
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

router.get("/partners/:partnerId/audits", async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { month, year } = req.query;

    const params = [partnerId];

    let monthYearFilter = "";

    if (month && year) {
      monthYearFilter = " AND a.month = ? AND a.year = ? ";
      params.push(Number(month), Number(year));
    }

    const [audits] = await db.promise().query(
      `
      SELECT
        a.id,
        a.partner_id,
        pm.partner_name,
        a.booking_lan,
        a.loan_amount,
        a.month,
        a.year,
        a.action_type,
        a.created_at
      FROM partner_limit_audit a
      JOIN partner_master pm 
        ON pm.partner_id = a.partner_id
      WHERE a.partner_id = ?
      ${monthYearFilter}
      ORDER BY a.created_at DESC
      LIMIT 300
      `,
      params
    );

    res.json({
      partner_id: Number(partnerId),
      month: month ? Number(month) : null,
      year: year ? Number(year) : null,
      audits,
    });
  } catch (err) {
    console.error("Partner audit fetch error:", err);

    res.status(500).json({
      message: "Failed to fetch partner audits",
      error: err.message,
    });
  }
});

// POST /api/partners - Create new partner
router.post("/partners", async (req, res) => {
  const conn = await db.promise().getConnection();

  try {
    const { partner_name } = req.body;

    if (!partner_name || partner_name.trim() === "") {
      return res.status(400).json({ error: "partner_name required" });
    }

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partner_name,
    );

    res.status(201).json({
      message: "Partner created successfully",
      partner,
    });
  } catch (err) {
    console.error("Partner create error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/partners/:name/limits - Set monthly limit
router.post("/partners/:name/limits", async (req, res) => {
  try {
    const { name } = req.params;
    const { month, year, assigned_limit } = req.body;
    if (!month || !year || assigned_limit == null) {
      return res
        .status(400)
        .json({ error: "month, year, assigned_limit required" });
    }

    const conn = await db.promise().getConnection();
    await conn.beginTransaction();

    try {
      const partner = await partnerLimitService.getOrCreatePartner(conn, name);
      let limitId;

      // Get or create limit record
      try {
        const limit = await partnerLimitService.getPartnerMonthlyLimit(
          conn,
          partner.partner_id,
          month,
          year,
        );
        limitId = limit.id;
      } catch {
        // Create if not exists (ignore auto-create policy here)
        const [result] = await conn.query(
          `INSERT INTO partner_monthly_limit (partner_id, month, year, assigned_limit, used_limit) 
           VALUES (?, ?, ?, ?, 0)`,
          [partner.partner_id, month, year, assigned_limit],
        );
        limitId = result.insertId;
      }

      // Update assigned limit
      await conn.query(
        `UPDATE partner_monthly_limit SET assigned_limit = ?, updated_at = NOW() WHERE id = ?`,
        [assigned_limit, limitId],
      );

      await conn.commit();
      conn.release();

      res.json({ message: "Limit updated", limit_id: limitId });
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  } catch (err) {
    console.error("Limit set error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/partners/partners/:partnerId/limits - Edit assigned limit and/or
// POS limit for an existing partner (real edit action for the Partner Limits
// screen, distinct from the create-partner POST above).
router.put("/partners/:partnerId/limits", async (req, res) => {
  const conn = await db.promise().getConnection();

  try {
    const { partnerId } = req.params;
    const { assigned_limit, pos_limit } = req.body;

    const month = parseInt(req.body.month) || new Date().getMonth() + 1;
    const year = parseInt(req.body.year) || new Date().getFullYear();

    await conn.beginTransaction();

    if (pos_limit !== undefined) {
      const normalizedPosLimit =
        pos_limit === null || pos_limit === "" ? null : Number(pos_limit);

      // A POS limit below what's already outstanding would be breached the
      // moment it's saved, before any new disbursement even happens — block
      // it here rather than silently accepting a value the system can never
      // honor.
      if (normalizedPosLimit !== null) {
        const [[partnerRow]] = await conn.query(
          `SELECT partner_name FROM partner_master WHERE partner_id = ?`,
          [partnerId],
        );

        if (!partnerRow) {
          throw new Error("Partner not found");
        }

        const { posMap } = await getPartnerPOSMap(conn);
        const currentPos = Number(
          posMap[String(partnerRow.partner_name || "").toLowerCase()] || 0,
        );

        if (normalizedPosLimit < currentPos) {
          await conn.rollback();

          return res.status(400).json({
            error: `POS limit (₹${normalizedPosLimit}) cannot be lower than the partner's current POS (₹${currentPos.toFixed(2)}).`,
            currentPos,
          });
        }
      }

      await conn.query(
        `UPDATE partner_master SET pos_limit = ? WHERE partner_id = ?`,
        [normalizedPosLimit, partnerId],
      );
    }

    if (assigned_limit !== undefined && assigned_limit !== null && assigned_limit !== "") {
      const [[existing]] = await conn.query(
        `
        SELECT id
        FROM partner_monthly_limit
        WHERE partner_id = ? AND month = ? AND year = ?
        `,
        [partnerId, month, year],
      );

      if (existing) {
        await conn.query(
          `
          UPDATE partner_monthly_limit
          SET assigned_limit = ?, updated_at = NOW()
          WHERE id = ?
          `,
          [Number(assigned_limit), existing.id],
        );
      } else {
        await conn.query(
          `
          INSERT INTO partner_monthly_limit
            (partner_id, month, year, assigned_limit, used_limit)
          VALUES (?, ?, ?, ?, 0)
          `,
          [partnerId, month, year, Number(assigned_limit)],
        );
      }
    }

    await conn.commit();

    res.json({ message: "Partner limits updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("Partner limits update error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/partners/:name/limits - Get partner limits history
router.get("/partners/:name/limits", async (req, res) => {
  try {
    const { name } = req.params;
    const { year } = req.query;

    const [partner] = await db
      .promise()
      .query("SELECT partner_id FROM partner_master WHERE partner_name = ?", [
        name,
      ]);
    if (!partner.length)
      return res.status(404).json({ error: "Partner not found" });

    const [limits] = await db.promise().query(
      `SELECT month, year, assigned_limit, used_limit, remaining_limit 
       FROM partner_monthly_limit 
       WHERE partner_id = ?${year ? " AND year = ?" : ""}
       ORDER BY year DESC, month DESC`,
      [partner[0].partner_id, ...(year ? [year] : [])],
    );

    const [audits] = await db.promise().query(
      `SELECT a.*, pm.partner_name, lb.lan as booking_lan
       FROM partner_limit_audit a
       JOIN partner_master pm ON a.partner_id = pm.partner_id
       LEFT JOIN loan_bookings lb ON a.booking_lan = lb.lan
       WHERE pm.partner_name = ?
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [name],
    );

    res.json({ limits, recent_audits: audits });
  } catch (err) {
    console.error("Partner limits error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
