import { Router } from 'express';
import { getDb } from '../db.js';
import { audit } from '../services/audit.js';

const router = Router();
const ALLOWED = ['kind','cat1','cat2','cat3','cat4','code','name','aliases','spec','unit','price','note'];

// autocomplete（品名/別名/編號）
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const kind = req.query.kind; // equipment | consumable
  const db = getDb();
  let sql = `SELECT id, kind, code, name, aliases, spec, unit, price FROM items WHERE 1=1`;
  const params = [];
  if (kind) { sql += ` AND kind = ?`; params.push(kind); }
  if (q) {
    sql += ` AND (name LIKE ? OR aliases LIKE ? OR code LIKE ? OR spec LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ` ORDER BY name LIMIT 50`;
  const rows = db.prepare(sql).all(...params);
  res.json({ query: { q, kind }, count: rows.length, rows });
});

// 建立物料
router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body;
  const info = db.prepare(
    `INSERT INTO items (kind, cat1, cat2, cat3, cat4, code, name, aliases, spec, unit, price, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(b.kind||'equipment', b.cat1||null, b.cat2||null, b.cat3||null, b.cat4||null,
    b.code||null, b.name, b.aliases||null, b.spec||null, b.unit||null, b.price||null, b.note||null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// PATCH 修改物料（audit_log）
router.patch('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  const sets = []; const vals = [];
  for (const k of ALLOWED) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  vals.push(id);
  db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  audit('items', id, old, row);
  res.json(row);
});

// DELETE 刪除物料（audit_log；若有 units 或 stock 關聯則拒絕）
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  const unitCount = db.prepare('SELECT COUNT(*) AS c FROM units WHERE item_id = ?').get(id).c;
  if (unitCount > 0) return res.status(400).json({ error: `尚有 ${unitCount} 個設備個體，無法刪除` });
  const slipCount = db.prepare('SELECT COUNT(*) AS c FROM slip_items WHERE item_id = ?').get(id).c;
  if (slipCount > 0) return res.status(400).json({ error: `尚有 ${slipCount} 筆進出單明細使用此器材，無法刪除` });
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  db.prepare('DELETE FROM stock WHERE item_id = ?').run(id);
  audit('items', id, old, null);
  res.json({ deleted: true, id });
});

// 建立設備個體（僅 equipment）
router.post('/:id/units', (req, res) => {
  const db = getDb();
  const b = req.body;
  const info = db.prepare(
    `INSERT INTO units (item_id, serial, status, location, custodian, last_transfer_date, purchase_date, property_no)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, b.serial||null, b.status||'in_stock', b.location||null,
    b.custodian||null, b.last_transfer_date||null, b.purchase_date||null, b.property_no||null);
  res.status(201).json({ id: info.lastInsertRowid });
});

export default router;
