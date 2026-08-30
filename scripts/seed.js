// 初始化 DB + 播種測試資料（單一進程，避免 WAL 跨進程問題）
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dbPath = join(root, 'data/warehouse.db');

// 清除舊檔（含 WAL/SHM）
for (const ext of ['', '-wal', '-shm']) {
  const f = dbPath + ext;
  if (existsSync(f)) { unlinkSync(f); console.log('刪除', f); }
}

const dir = join(root, 'data');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const schema = readFileSync(join(root, 'src/schema.sql'), 'utf8');
db.exec(schema);
console.log('schema 初始化完成');

// ── 播種 ──
const items = [
  { kind:'equipment', code:'E-F-I-A', name:'高壓灌注機', aliases:'小蜜蜂', spec:'小蜜蜂', price:11500 },
  { kind:'equipment', code:'E-G-Q-B', name:'鑽機', aliases:'鑽堡,鑽堡抽水機', spec:'D2-JS', price:800000 },
  { kind:'equipment', code:'E-S-E-A', name:'發電機', aliases:'', spec:'SG-5002XA HONDA', price:445000 },
  { kind:'equipment', code:'E-S-Q-J', name:'洗車機', aliases:'洗網機', spec:'鑽石TS-100 5HP', price:17501 },
  { kind:'equipment', code:'E-G-Q-A', name:'流量計', aliases:'', spec:'TFP U100', price:5000 },
  { kind:'consumable', name:'雙簧塞', aliases:'packer,雙環塞', spec:'紅', unit:'支', price:300 },
  { kind:'consumable', name:'雙簧塞', aliases:'', spec:'白', unit:'支', price:300 },
  { kind:'consumable', name:'二重管', aliases:'', spec:'3M', unit:'支', price:2000 },
  { kind:'consumable', name:'二重管', aliases:'', spec:'1.5M', unit:'支', price:1500 },
  { kind:'consumable', name:'二重管', aliases:'', spec:'50cm', unit:'支', price:800 },
];

const insItem = db.prepare(`INSERT INTO items (kind,cat1,cat2,cat3,cat4,code,name,aliases,spec,unit,price) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const ids = {};
for (const it of items) {
  const cats = (it.code||'').split('-');
  const info = insItem.run(it.kind, cats[0]||null, cats[1]||null, cats[2]||null, cats[3]||null, it.code||null, it.name, it.aliases||null, it.spec||null, it.unit||null, it.price||null);
  ids[it.name + (it.spec||'')] = info.lastInsertRowid;
  ids[it.name] = info.lastInsertRowid;
}

// 案場
const insCase = db.prepare(`INSERT OR IGNORE INTO cases (case_no,name) VALUES (?,?)`);
insCase.run('26-023','田野'); insCase.run('24-014','桃園'); insCase.run('25-002','高雄'); insCase.run('26-022','台中大里'); insCase.run('24-010-6','麥寮'); insCase.run('21-013','下湖路');

// 設備個體
const insUnit = db.prepare(`INSERT INTO units (item_id,serial,status,location,custodian,last_transfer_date,purchase_date) VALUES (?,?,?,?,?,?,?)`);
const u = (key, serial, status, loc, cust, td, pd) => insUnit.run(ids[key], serial, status, loc, cust, td, pd).lastInsertRowid;
u('高壓灌注機','01','in_stock','倉庫',null,null,'2023-08-30');
u('高壓灌注機','02','in_stock','倉庫',null,null,'2023-08-30');
u('高壓灌注機','14','out','26-023','黃英芳','2026-08-24','2023-07-19');
u('高壓灌注機','18','out','24-014','黃英芳','2026-08-14',null);
u('高壓灌注機','21','in_stock','1倉',null,'2026-08-17','2024-02-18');
u('鑽機','21','out','26-023','黃英芳','2026-08-24','2018-07-13');
u('鑽機','11','in_stock','倉庫',null,'2026-08-26','2019-05-01');
u('鑽機','01','repair','志芳維修',null,'2026-05-10',null);
u('發電機','34','repair','送修',null,'2026-06-09','2019-09-23');
u('發電機','29','in_stock','倉庫',null,'2026-05-21','2020-09-23');
u('發電機','07','out','21-013','余經理','2025-08-01','2018-12-04');
u('洗車機','09','repair','送修-壓力輪壞',null,'2026-06-02','2021-08-01');
u('洗車機','20','out','26-023','黃英芳','2026-08-24','2021-08-01');
for (const s of ['58','72','97','102','69','93']) u('流量計', s, 'in_stock', '倉庫', null, null, null);
u('流量計','71','out','25-002','洪明憲','2026-08-12',null);
u('流量計','109','out','25-002','洪明憲','2026-08-12',null);

// 耗材庫存
const insStock = db.prepare(`INSERT INTO stock (item_id,condition,qty,safety_qty) VALUES (?,?,?,?)`);
insStock.run(ids['雙簧塞紅'],'good',47,10);
insStock.run(ids['雙簧塞紅'],'repair',3,0);
insStock.run(ids['雙簧塞白'],'good',8,5);
insStock.run(ids['二重管3M'],'good',12,5);
insStock.run(ids['二重管3M'],'repair',2,0);
insStock.run(ids['二重管1.5M'],'good',4,5);
insStock.run(ids['二重管50cm'],'good',3,5);

// 進出單
const insSlip = db.prepare(`INSERT INTO slips (no,type,date,case_no,borrower,confirmer,source,status,note) VALUES (?,?,?,?,?,?,?,?,?)`);
const insSI = db.prepare(`INSERT INTO slip_items (slip_id,item_id,unit_id,qty,from_loc,to_loc,condition_note,new_serial) VALUES (?,?,?,?,?,?,?,?)`);
const insMv = db.prepare(`INSERT INTO movements (slip_id,item_id,unit_id,type,date,from_loc,to_loc,person,note) VALUES (?,?,?,?,?,?,?,?,?)`);

const slip = (no, type, date, caseNo, borrower, note) => {
  const chk = db.prepare('SELECT case_no FROM cases WHERE case_no = ?').get(caseNo);
  if (!chk) console.log(`!! case ${caseNo} not found in cases table`);
  return insSlip.run(no, type, date, caseNo, borrower, '管理員', 'manual', 'confirmed', note).lastInsertRowid;
};

let sid;
sid = slip('S-2026-0001','out','2026-08-24','26-023','黃英芳','26-023出倉');
insSI.run(sid, ids['鑽機'], 6, 1, '倉庫', '26-023', null, 0);
insMv.run(sid, ids['鑽機'], 6, 'out', '2026-08-24', '倉庫', '26-023', '黃英芳', null);
insSI.run(sid, ids['洗車機'], 13, 1, '倉庫', '26-023', null, 0);
insMv.run(sid, ids['洗車機'], 13, 'out', '2026-08-24', '倉庫', '26-023', '黃英芳', null);

sid = slip('S-2026-0002','out','2026-08-14','24-014','黃英芳','24-014出倉');
insSI.run(sid, ids['高壓灌注機'], 4, 1, '倉庫', '24-014', null, 0);
insMv.run(sid, ids['高壓灌注機'], 4, 'out', '2026-08-14', '倉庫', '24-014', '黃英芳', null);

sid = slip('S-2026-0003','repair_out','2026-06-09','24-010-6',null,'發電機#34無法啟動');
insSI.run(sid, ids['發電機'], 9, 1, '24-010-6', '送修', '無法啟動', 0);
insMv.run(sid, ids['發電機'], 9, 'repair_out', '2026-06-09', '24-010-6', '送修', null, '無法啟動');

sid = slip('S-2026-0004','out','2026-08-12','25-002','洪明憲','25-002出倉');
insSI.run(sid, ids['流量計'], 16, 1, '倉庫', '25-002', null, 0);
insMv.run(sid, ids['流量計'], 16, 'out', '2026-08-12', '倉庫', '25-002', '洪明憲', null);
insSI.run(sid, ids['流量計'], 17, 1, '倉庫', '25-002', null, 0);
insMv.run(sid, ids['流量計'], 17, 'out', '2026-08-12', '倉庫', '25-002', '洪明憲', null);

sid = slip('S-2026-0005','in','2026-08-17','26-022','黃英芳','26-022回倉');
insSI.run(sid, ids['高壓灌注機'], 5, 1, '26-022', '1倉', null, 0);
insMv.run(sid, ids['高壓灌注機'], 5, 'in', '2026-08-17', '26-022', '1倉', '黃英芳', null);

sid = slip('S-2026-0006','out','2026-08-24','26-023','黃英芳','雙簧塞出倉');
insSI.run(sid, ids['雙簧塞紅'], null, 4, '倉庫', '26-023', null, 0);
insMv.run(sid, ids['雙簧塞紅'], null, 'out', '2026-08-24', '倉庫', '26-023', '黃英芳', null);

db.close();
const h = new Database(dbPath, { readonly: true }).prepare(`SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM units) AS units, (SELECT COUNT(*) FROM slips) AS slips, (SELECT COUNT(*) FROM movements) AS movements`).get();
console.log('播種完成:', JSON.stringify(h));
