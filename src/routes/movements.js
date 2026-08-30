import { Router } from 'express';
import { getDb } from '../db.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { from, to, case: caseNo, type, unit, item } = req.query;
  let sql = `SELECT m.*, s.no AS slip_no, i.name, i.code FROM movements m
             LEFT JOIN slips s ON m.slip_id = s.id JOIN items i ON m.item_id = i.id WHERE 1=1`;
  const params = [];
  if (from) { sql += ` AND m.date >= ?`; params.push(from); }
  if (to) { sql += ` AND m.date <= ?`; params.push(to); }
  if (caseNo) { sql += ` AND (m.from_loc = ? OR m.to_loc = ?)`; params.push(caseNo, caseNo); }
  if (type) { sql += ` AND m.type = ?`; params.push(type); }
  if (unit) { sql += ` AND m.unit_id = ?`; params.push(unit); }
  if (item) { sql += ` AND m.item_id = ?`; params.push(item); }
  sql += ` ORDER BY m.date DESC, m.id DESC LIMIT 500`;
  const rows = db.prepare(sql).all(...params);
  res.json({ query: req.query, count: rows.length, rows });
});

// 報表：依案號/品名/類型分組聚合
router.get('/movements', (req, res) => {
  const db = getDb();
  const { from, to, case: caseNo, type, group, slip_no } = req.query;
  const groupBy = { case: 'm.to_loc', item: 'i.name', type: 'm.type' }[group] || 'i.name';
  let sql = `SELECT ${groupBy} AS grp, COUNT(*) AS cnt, SUM(CASE WHEN m.type IN ('in','return','repair_back') THEN 1 ELSE 0 END) AS inflow,
             SUM(CASE WHEN m.type IN ('out','repair_out','scrap') THEN 1 ELSE 0 END) AS outflow
             FROM movements m JOIN items i ON m.item_id = i.id LEFT JOIN slips s ON m.slip_id = s.id WHERE 1=1`;
  const params = [];
  if (from) { sql += ` AND m.date >= ?`; params.push(from); }
  if (to) { sql += ` AND m.date <= ?`; params.push(to); }
  if (caseNo) { sql += ` AND (m.from_loc = ? OR m.to_loc = ?)`; params.push(caseNo, caseNo); }
  if (type) { sql += ` AND m.type = ?`; params.push(type); }
  if (slip_no) { sql += ` AND s.no = ?`; params.push(slip_no); }
  sql += ` GROUP BY ${groupBy} ORDER BY cnt DESC`;
  const rows = db.prepare(sql).all(...params);
  if (req.query.format === 'csv') {
    const header = `${group || 'item'},count,inflow,outflow`;
    const lines = rows.map(r => `${r.grp},${r.cnt},${r.inflow},${r.outflow}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="movements-report.csv"`);
    return res.send('\uFEFF' + [header, ...lines].join('\n'));
  }
  res.json({ query: req.query, count: rows.length, rows });
});

// 異動明細 CSV 匯出
router.get('/export', (req, res) => {
  const db = getDb();
  const { from, to, case: caseNo, type } = req.query;
  let sql = `SELECT m.date, m.type, i.name, i.code, u.serial, m.from_loc, m.to_loc, m.person, m.note, s.no AS slip_no
             FROM movements m JOIN items i ON m.item_id = i.id
             LEFT JOIN units u ON m.unit_id = u.id LEFT JOIN slips s ON m.slip_id = s.id WHERE 1=1`;
  const params = [];
  if (from) { sql += ` AND m.date >= ?`; params.push(from); }
  if (to) { sql += ` AND m.date <= ?`; params.push(to); }
  if (caseNo) { sql += ` AND (m.from_loc = ? OR m.to_loc = ?)`; params.push(caseNo, caseNo); }
  if (type) { sql += ` AND m.type = ?`; params.push(type); }
  sql += ` ORDER BY m.date DESC LIMIT 5000`;
  const rows = db.prepare(sql).all(...params);
  const header = '日期,類型,品名,代碼,編號,來源,目的地,經手人,備註,單號';
  const lines = rows.map(r => [r.date,r.type,r.name,r.code||'',r.serial||'',r.from_loc||'',r.to_loc||'',r.person||'',r.note||'',r.slip_no||''].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="movements.csv"`);
  res.send('\uFEFF' + [header, ...lines].join('\n'));
});

// PATCH 修改異動紀錄（audit_log）
router.patch('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM movements WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  const ALLOWED = ['type','date','qty','from_loc','to_loc','person','from_person','to_person','note'];
  const sets = []; const vals = [];
  for (const k of ALLOWED) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  vals.push(id);
  db.prepare(`UPDATE movements SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM movements WHERE id = ?').get(id);
  audit('movements', id, old, row);
  res.json(row);
});

// DELETE 刪除異動紀錄（audit_log）
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM movements WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM movements WHERE id = ?').run(id);
  audit('movements', id, old, null);
  res.json({ deleted: true, id });
});

export default router;
