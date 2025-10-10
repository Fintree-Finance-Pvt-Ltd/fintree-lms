const path = require('path');
const { getPool } = require('../config/db');
const { extractSummary } = require('../utils/xml');
const { generateCibilPdf } = require('../utils/pdf');

const DOCS_BASE_DIR = path.resolve(process.env.DOCS_BASE_DIR || 'uploads/cibil');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || ''; // optional

async function upsertLoanDocument(conn, { lan, filePath, sourceUrl, originalName, meta }) {
  const metaJson = JSON.stringify(meta || {});
  await conn.query(
    `INSERT INTO loan_documents 
      (lan, doc_name, source_url, doc_password, file_name, original_name, meta_json, uploaded_at)
     VALUES (?, 'cibil_report', ?, NULL, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       source_url = VALUES(source_url),
       file_name = VALUES(file_name),
       original_name = VALUES(original_name),
       meta_json = VALUES(meta_json),
       uploaded_at = VALUES(uploaded_at)`,
    [lan, sourceUrl, filePath, originalName, metaJson]
  );
}

// POST /api/cibil/:lan/generate
async function generateForLan(req, res) {
  const lan = req.params.lan;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT lan, report_xml, score FROM loan_cibil_reports WHERE lan = ? LIMIT 1`,
      [lan]
    );
    if (!rows.length) return res.status(404).json({ error: `No record for LAN ${lan}` });

    const xml = rows[0].report_xml;
    if (!xml || !xml.trim()) return res.status(400).json({ error: `report_xml empty for ${lan}` });

    const summary = await extractSummary(xml);

    // file system paths
    const outDir = path.join(DOCS_BASE_DIR, lan);
    const fileName = 'cibil_report.pdf';
    const filePath = path.join(outDir, fileName);

    await generateCibilPdf(summary, filePath);

    // URL for downloads (optional)
    const sourceUrl = PUBLIC_BASE_URL
      ? `${PUBLIC_BASE_URL.replace(/\/$/, '')}/${encodeURIComponent('cibil')}/${encodeURIComponent(lan)}/${encodeURIComponent(fileName)}`
      : null;

    await upsertLoanDocument(conn, {
      lan,
      filePath: path.relative(path.resolve('.'), filePath), // store relative path
      sourceUrl,
      originalName: fileName,
      meta: {
        report_no: summary.reportNo,
        score: summary.score,
        generated_from: 'report_xml',
      }
    });

    return res.json({
      lan,
      file_name: filePath,
      source_url: sourceUrl,
      message: 'CIBIL PDF generated & saved to loan_documents.'
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error', details: e.message });
  } finally {
    conn.release();
  }
}

// POST /api/cibil/generate-all
async function generateForAll(req, res) {
  const pool = getPool();
  const conn = await pool.getConnection();
  const results = [];
  try {
    const [rows] = await conn.query(`
      SELECT lan, report_xml, score
      FROM loan_cibil_reports
      WHERE report_xml IS NOT NULL AND LENGTH(TRIM(report_xml)) > 0
    `);

    for (const row of rows) {
      const lan = row.lan;
      try {
        const summary = await extractSummary(row.report_xml);

        const outDir = path.join(DOCS_BASE_DIR, lan);
        const fileName = 'cibil_report.pdf';
        const filePath = path.join(outDir, fileName);

        await generateCibilPdf(summary, filePath);

        const sourceUrl = PUBLIC_BASE_URL
          ? `${PUBLIC_BASE_URL.replace(/\/$/, '')}/${encodeURIComponent('cibil')}/${encodeURIComponent(lan)}/${encodeURIComponent(fileName)}`
          : null;

        await upsertLoanDocument(conn, {
          lan,
          filePath: path.relative(path.resolve('.'), filePath),
          sourceUrl,
          originalName: fileName,
          meta: { report_no: summary.reportNo, score: summary.score, generated_from: 'report_xml' }
        });

        results.push({ lan, status: 'ok', file_name: filePath, source_url: sourceUrl });
      } catch (err) {
        console.error('Error for lan', lan, err);
        results.push({ lan, status: 'error', error: err.message });
      }
    }
    return res.json({ total: results.length, results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error', details: e.message });
  } finally {
    conn.release();
  }
}

module.exports = { generateForLan, generateForAll };
