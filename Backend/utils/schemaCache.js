// utils/schemaCache.js
const schemaCache = {};

async function loadSchema(db, tables) {
  for (const table of tables) {
    const [rows] = await db.promise().query(
      `SHOW COLUMNS FROM \`${table}\``
    );
    schemaCache[table] = rows.map(r => r.Field);
  }
}

function hasColumn(table, col) {
  return schemaCache[table]?.includes(col);
}

module.exports = { loadSchema, hasColumn };
