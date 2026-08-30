import { Router } from 'express';
import { getDb } from '../db.js';
import { audit } from '../services/audit.js';

const router = Router();

const ALLOWED = ['serial','status','location','custodian','last_transfer_date','purchase_date','property_no'];

// 設備個體篩選
router.get('/', (req, res) => {
  const db = getDb();
  const { status, item, location } = req.query;
  let sql = `SELECT u.*, i.name, i.code, i.spec FROM units u JOIN items i ON u.item_id = i.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND u.status = ?`; params.push(status); }
  if (item) { sql += ` AND u.item_id = ?`; params.push(item); }
  if (location) { sql += ` AND u.location LIKE ?`; params.push(`%${location}%`); }
  sql += ` ORDER BY u.id DESC LIMIT 500`;
  const rows = db.prepare(sql).all(...params);
  res.json({ query: { status, item, location }, count: rows.length, rows });
});

// 單機歷史卡
router.get('/:id/history', (req, res) => {
  const db = getDb();
  const id = req.params.id;
  const unit = db.prepare(
    `SELECT u.*, i.name, i.code, i.spec FROM units u JOIN items i ON u.item_id = i.id WHERE u.id = ?`
  ).get(id);
  if (!unit) return res.status(404).json({ error: 'not found' });
  const movements = db.prepare(
    `SELECT m.*, s.no AS slip_no FROM movements m LEFT JOIN slips s ON m.slip_id = s.id
     WHERE m.unit_id = ? ORDER BY m.date DESC`
  ).all(id);
  const summary = `設備 ${unit.name} #${unit.serial || ''} 共 ${movements.length} 筆異動，目前${unit.location || '未知'}，狀態${unit.status}`;
  res.json({ unit, count: movements.length, rows: movements, summary });
});

// PATCH 修改設備個體（audit_log）
router.patch('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM units WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  const sets = [];
  const vals = [];
  for (const k of ALLOWED) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  vals.push(id);
  db.prepare(`UPDATE units SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM units WHERE id = ?').get(id);
  audit('units', id, old, row);
  res.json(row);
});

// DELETE 刪除設備個體（audit_log）
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM units WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM units WHERE id = ?').run(id);
  db.prepare('DELETE FROM movements WHERE unit_id = ? AND slip_id IS NULL').run(id);
  audit('units', id, old, null);
  res.json({ deleted: true, id });
});

export default router;
