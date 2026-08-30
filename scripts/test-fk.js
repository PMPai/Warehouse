import { getDb } from '../src/db.js';
const db = getDb();
console.log('cases:', db.prepare('SELECT * FROM cases').all());
try {
  const r = db.prepare(`INSERT INTO slips (no,type,date,case_no,borrower,confirmer,source,status,note) VALUES ('S-TEST','out','2026-01-01','26-023','test','admin','manual','draft',null)`).run();
  console.log('slip ok:', r.lastInsertRowid);
} catch(e) { console.log('slip err:', e.message); }
process.exit(0);
