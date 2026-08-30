import { getDb } from '../db.js';

export function audit(tbl, rowId, oldRow, newRow) {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (user_id, tbl, row_id, old_json, new_json)
     VALUES (1, ?, ?, ?, ?)`
  ).run(
    tbl, rowId,
    oldRow ? JSON.stringify(oldRow) : null,
    newRow ? JSON.stringify(newRow) : null
  );
}
