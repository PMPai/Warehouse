import { Router } from 'express';
import { getDb } from '../db.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { item, low } = req.query;
  let sql = `SELECT s.item_id, s.condition, s.qty, s.safety_qty, i.name, i.code, i.spec, i.unit
             FROM stock s JOIN items i ON s.item_id = i.id WHERE 1=1`;
  const params = [];
  if (item) { sql += ` AND s.item_id = ?`; params.push(item); }
  if (low === '1' || low === 'true') { sql += ` AND s.qty <= s.safety_qty`; }
  sql += ` ORDER BY i.name`;
  const rows = db.prepare(sql).all(...params);
  const summary = `共 ${rows.length} 筆庫存紀錄`;
  res.json({ query: req.query, count: rows.length, rows, summary });
});

// PATCH 修改庫存（qty / safety_qty，audit_log）
router.patch('/:itemId', (req, res) => {
  const db = getDb();
  const itemId = Number(req.params.itemId);
  const cond = req.body.condition || 'good';
  const old = db.prepare('SELECT * FROM stock WHERE item_id = ? AND condition = ?').get(itemId, cond);
  if (!old) return res.status(404).json({ error: 'stock not found' });
  const sets = []; const vals = [];
  if (req.body.qty !== undefined) { sets.push('qty = ?'); vals.push(req.body.qty); }
  if (req.body.safety_qty !== undefined) { sets.push('safety_qty = ?'); vals.push(req.body.safety_qty); }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  vals.push(itemId, cond);
  db.prepare(`UPDATE stock SET ${sets.join(', ')} WHERE item_id = ? AND condition = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM stock WHERE item_id = ? AND condition = ?').get(itemId, cond);
  audit('stock', itemId, old, row);
  res.json(row);
});

// POST 新增/設定庫存（upsert）
router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body;
  const cond = b.condition || 'good';
  db.prepare(
    `INSERT INTO stock (item_id, condition, qty, safety_qty) VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id, condition) DO UPDATE SET qty=excluded.qty, safety_qty=excluded.safety_qty`
  ).run(b.item_id, cond, b.qty || 0, b.safety_qty || 0);
  res.status(201).json({ item_id: b.item_id, condition: cond });
});

// POST 調整庫存（增減 delta，非絕對值）
router.post('/adjust', (req, res) => {
  const db = getDb();
  const b = req.body;
  const cond = b.condition || 'good';
  const item = db.prepare('SELECT kind,name FROM items WHERE id = ?').get(b.item_id);
  if (!item) return res.status(404).json({ error: 'item not found' });
  if (item.kind !== 'consumable') return res.status(400).json({ error: '僅耗材可調整庫存' });
  db.prepare('INSERT OR IGNORE INTO stock (item_id, condition, qty, safety_qty) VALUES (?, ?, 0, 0)').run(b.item_id, cond);
  const old = db.prepare('SELECT * FROM stock WHERE item_id = ? AND condition = ?').get(b.item_id, cond);
  db.prepare('UPDATE stock SET qty = qty + ? WHERE item_id = ? AND condition = ?').run(b.delta || 0, b.item_id, cond);
  const row = db.prepare('SELECT * FROM stock WHERE item_id = ? AND condition = ?').get(b.item_id, cond);
  audit('stock', b.item_id, old, row);
  const type = (b.delta || 0) > 0 ? 'in' : 'out';
  db.prepare(
    `INSERT INTO movements (slip_id, item_id, type, date, qty, from_loc, to_loc, person, note)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(b.item_id, type, b.date || new Date().toISOString().slice(0,10), Math.abs(b.delta || 0),
    b.from_loc || null, b.to_loc || null, b.person || '管理員', b.note || '庫存調整');
  res.json({ item_id: b.item_id, condition: cond, qty: row.qty, delta: b.delta });
});

// DELETE 刪除庫存桶（audit_log）
router.delete('/:itemId', (req, res) => {
  const db = getDb();
  const itemId = Number(req.params.itemId);
  const cond = req.query.condition || 'good';
  const old = db.prepare('SELECT * FROM stock WHERE item_id = ? AND condition = ?').get(itemId, cond);
  if (!old) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM stock WHERE item_id = ? AND condition = ?').run(itemId, cond);
  audit('stock', itemId, old, null);
  res.json({ deleted: true, item_id: itemId, condition: cond });
});

export default router;
