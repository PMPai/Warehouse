import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM cases ORDER BY case_no').all();
  res.json({ count: rows.length, rows });
});

router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body;
  db.prepare('INSERT OR IGNORE INTO cases (case_no, name, status) VALUES (?, ?, ?)')
    .run(b.case_no, b.name||null, b.status||'active');
  res.status(201).json({ case_no: b.case_no });
});

router.patch('/:caseNo', (req, res) => {
  const db = getDb();
  const sets = []; const vals = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.status !== undefined) { sets.push('status = ?'); vals.push(req.body.status); }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  vals.push(req.params.caseNo);
  db.prepare(`UPDATE cases SET ${sets.join(', ')} WHERE case_no = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM cases WHERE case_no = ?').get(req.params.caseNo));
});

router.delete('/:caseNo', (req, res) => {
  const db = getDb();
  const caseNo = req.params.caseNo;
  const old = db.prepare('SELECT * FROM cases WHERE case_no = ?').get(caseNo);
  if (!old) return res.status(404).json({ error: 'not found' });
  const slipCount = db.prepare('SELECT COUNT(*) AS c FROM slips WHERE case_no = ? OR to_case_no = ?').get(caseNo, caseNo).c;
  if (slipCount > 0) return res.status(400).json({ error: `尚有 ${slipCount} 筆進出單使用此案號，無法刪除` });
  db.prepare('DELETE FROM cases WHERE case_no = ?').run(caseNo);
  res.json({ deleted: true, case_no: caseNo });
});

export default router;
