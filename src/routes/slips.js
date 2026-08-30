import { Router } from 'express';
import { getDb } from '../db.js';
import { confirmSlip } from '../services/writeTransaction.js';
import { audit } from '../services/audit.js';
import { getPhotosDir } from '../db.js';
import multer from 'multer';
import { join } from 'node:path';

const router = Router();
const SLIP_FIELDS = ['type','date','case_no','to_case_no','from_person','borrower','confirmer','note'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, getPhotosDir()),
  filename: (req, file, cb) => {
    const ext = (file.originalname.match(/\.\w+$/) || [''])[0];
    cb(null, `slip-${Date.now()}-${Math.round(Math.random()*1e4)}${ext}`);
  }
});
const upload = multer({ storage });

function nextNo(db, date) {
  const year = (date || new Date().toISOString().slice(0,10)).slice(0,4);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM slips WHERE no LIKE ?`).get(`S-${year}-%`);
  const n = (row?.c || 0) + 1;
  return `S-${year}-${String(n).padStart(4,'0')}`;
}

// 建立進出單（draft 或直接 confirmed）
router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body;
  const slip = typeof b === 'string' ? JSON.parse(b) : b;
  const date = slip.date;
  const no = slip.no || nextNo(db, date);
  const wantConfirm = (slip.status || 'draft') === 'confirmed';
  const tx = db.transaction(() => {
    if (slip.case_no) {
      db.prepare('INSERT OR IGNORE INTO cases (case_no) VALUES (?)').run(slip.case_no);
    }
    if (slip.to_case_no) {
      db.prepare('INSERT OR IGNORE INTO cases (case_no) VALUES (?)').run(slip.to_case_no);
    }
    const info = db.prepare(
      `INSERT INTO slips (no, type, date, case_no, to_case_no, from_person, borrower, confirmer, source, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(no, slip.type, date, slip.case_no||null, slip.to_case_no||null,
      slip.from_person||null, slip.borrower||null, slip.confirmer||null,
      slip.source||'manual', 'draft', slip.note||null);
    const slipId = info.lastInsertRowid;
    const items = slip.items || [];
    for (const si of items) {
      db.prepare(
        `INSERT INTO slip_items (slip_id, item_id, unit_id, qty, from_loc, to_loc, condition_note, new_serial, batch_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(slipId, si.item_id, si.unit_id||null, si.qty||1, si.from_loc||null,
        si.to_loc||null, si.condition_note||null, si.new_serial?1:0, si.batch_no||null);
    }
    return { slipId, no };
  });
  const result = tx();
  if (wantConfirm) {
    try { confirmSlip(result.slipId); }
    catch (e) { return res.status(400).json({ error: e.message, slipId: result.slipId }); }
  }
  res.status(201).json({ id: result.slipId, no: result.no, status: wantConfirm ? 'confirmed' : 'draft' });
});

// 確認
router.post('/:id/confirm', (req, res) => {
  try {
    const r = confirmSlip(Number(req.params.id));
    res.json({ id: Number(req.params.id), status: 'confirmed', newUnits: r.newUnits || [] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 查詢進出單
router.get('/', (req, res) => {
  const db = getDb();
  const { date, from, to, case: caseNo, type, borrower, item, unit } = req.query;
  let sql = `SELECT s.*, COUNT(si.id) AS item_count FROM slips s LEFT JOIN slip_items si ON si.slip_id = s.id WHERE 1=1`;
  const params = [];
  if (date) { sql += ` AND s.date = ?`; params.push(date); }
  if (from) { sql += ` AND s.date >= ?`; params.push(from); }
  if (to) { sql += ` AND s.date <= ?`; params.push(to); }
  if (caseNo) { sql += ` AND s.case_no = ?`; params.push(caseNo); }
  if (type) { sql += ` AND s.type = ?`; params.push(type); }
  if (borrower) { sql += ` AND s.borrower LIKE ?`; params.push(`%${borrower}%`); }
  if (item) { sql += ` AND EXISTS (SELECT 1 FROM slip_items si2 WHERE si2.slip_id=s.id AND si2.item_id=?)`; params.push(item); }
  if (unit) { sql += ` AND EXISTS (SELECT 1 FROM slip_items si3 WHERE si3.slip_id=s.id AND si3.unit_id=?)`; params.push(unit); }
  sql += ` GROUP BY s.id ORDER BY s.date DESC, s.id DESC LIMIT 500`;
  const rows = db.prepare(sql).all(...params);
  res.json({ query: req.query, count: rows.length, rows });
});

// 進出單明細
router.get('/:id', (req, res) => {
  const db = getDb();
  const slip = db.prepare('SELECT * FROM slips WHERE id = ?').get(req.params.id);
  if (!slip) return res.status(404).json({ error: 'not found' });
  const items = db.prepare(
    `SELECT si.*, i.name, i.code, i.spec, u.serial FROM slip_items si
     JOIN items i ON si.item_id = i.id LEFT JOIN units u ON si.unit_id = u.id
     WHERE si.slip_id = ?`
  ).all(req.params.id);
  const photos = db.prepare('SELECT id, filename FROM slip_photos WHERE slip_id = ?').all(req.params.id);
  res.json({ slip, items, photos });
});

// 上傳照片
router.post('/photos', upload.single('photo'), (req, res) => {
  const db = getDb();
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const slipId = req.body.slip_id;
  if (!slipId) return res.status(400).json({ error: 'slip_id required' });
  const info = db.prepare('INSERT INTO slip_photos (slip_id, filename) VALUES (?, ?)')
    .run(slipId, req.file.filename);
  res.status(201).json({ id: info.lastInsertRowid, filename: req.file.filename });
});

// PATCH 修改進出單頭（audit_log）
router.patch('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM slips WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  const sets = []; const vals = [];
  for (const k of SLIP_FIELDS) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  vals.push(id);
  db.prepare(`UPDATE slips SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM slips WHERE id = ?').get(id);
  audit('slips', id, old, row);
  res.json(row);
});

// PATCH 修改進出單明細單列
router.patch('/:id/items/:itemId', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const old = db.prepare('SELECT * FROM slip_items WHERE id = ? AND slip_id = ?').get(itemId, id);
  if (!old) return res.status(404).json({ error: 'not found' });
  const F = ['item_id','unit_id','qty','from_loc','to_loc','condition_note','new_serial','batch_no'];
  const sets = []; const vals = [];
  for (const k of F) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  vals.push(itemId);
  db.prepare(`UPDATE slip_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM slip_items WHERE id = ?').get(itemId);
  audit('slip_items', itemId, old, row);
  res.json(row);
});

// DELETE 刪除進出單（連帶刪明細＋異動紀錄，audit_log）
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM slips WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  const oldItems = db.prepare('SELECT * FROM slip_items WHERE slip_id = ?').all(id);
  const oldMv = db.prepare('SELECT * FROM movements WHERE slip_id = ?').all(id);
  db.prepare('DELETE FROM movements WHERE slip_id = ?').run(id);
  db.prepare('DELETE FROM slip_items WHERE slip_id = ?').run(id);
  db.prepare('DELETE FROM slip_photos WHERE slip_id = ?').run(id);
  db.prepare('DELETE FROM slips WHERE id = ?').run(id);
  audit('slips', id, { ...old, _items: oldItems, _movements: oldMv }, null);
  res.json({ deleted: true, id });
});

// DELETE 刪除進出單明細單列（audit_log）
router.delete('/:id/items/:itemId', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const old = db.prepare('SELECT * FROM slip_items WHERE id = ? AND slip_id = ?').get(itemId, id);
  if (!old) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM slip_items WHERE id = ?').run(itemId);
  audit('slip_items', itemId, old, null);
  res.json({ deleted: true, id: itemId });
});

export default router;
