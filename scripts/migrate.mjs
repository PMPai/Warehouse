// migrate.mjs — 從舊 .xls 匯入資料到新系統
// 用法: node scripts/migrate.mjs
// 會讀取 2026年資產明細表08-11.xls，匯入 items/units/stock/cases
import Database from 'better-sqlite3';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const xlsPath = join(root, '2026年資產明細表08-11.xls');
const dbPath = join(root, 'data/warehouse.db');

if (!existsSync(xlsPath)) {
  console.error(`找不到 ${xlsPath}`);
  process.exit(1);
}

// 重建 DB
for (const ext of ['', '-wal', '-shm']) {
  const f = dbPath + ext;
  if (existsSync(f)) unlinkSync(f);
}
mkdirSync(join(root, 'data'), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(readFileSync(join(root, 'src/schema.sql'), 'utf8'));
console.log('DB 重建完成');

const wb = XLSX.readFile(xlsPath);
const stats = { items: 0, units: 0, stock: 0, cases: 0 };

// ── helpers ──
function parseDate(s) {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  // 民國年: 115.08.24 or 115/08/24
  let m = t.match(/^(\d{2,3})[.\/](\d{1,2})[.\/](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1]) + 1911;
    return `${y}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  // 西元: 2024.08.24 or 2024-08-24
  m = t.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return null;
}

function parsePrice(s) {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/[, ]/g, ''));
  return isNaN(n) ? null : n;
}

function determineStatus(location, note, borrower, transferDate) {
  const loc = (location || '').toLowerCase();
  const nt = (note || '').toLowerCase();
  if (nt.includes('報廢') || nt.includes('作廢') || loc.includes('報廢')) return 'scrapped';
  if (nt.includes('不見') || loc.includes('不見')) return 'lost';
  if (nt.includes('壞掉') || nt.includes('壞') || loc.includes('壞掉')) return 'repair';
  if (nt.includes('送修') || loc.includes('送修')) return 'repair';
  // has borrower and transfer date but no "回倉" → out
  if (borrower && transferDate && !nt.includes('回倉')) return 'out';
  if (loc.includes('公司') || loc.includes('倉庫') || loc.includes('1倉') || loc.includes('2倉') || loc.includes('振興路') || loc.includes('下湖路') || loc.includes('八里') || loc.includes('桃園')) return 'in_stock';
  if (nt.includes('回倉')) return 'in_stock';
  // if location looks like a case number (XX-XXX)
  if (loc.match(/\d{2}-\d{3}/)) return 'out';
  return 'in_stock';
}

function extractCaseNo(text) {
  if (!text) return null;
  const m = String(text).match(/\d{2}-\d{3}(-\d+)?/);
  return m ? m[0] : null;
}

// ── 1. 匯入設備主檔（總明細表） ──
console.log('\n=== 匯入總明細表（設備）===');
const ws = wb.Sheets['總明細表'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, range: 1 }); // skip header

const insItem = db.prepare(`INSERT INTO items (kind,cat1,cat2,cat3,cat4,code,name,aliases,spec,unit,price,note) VALUES ('equipment',?,?,?,?,?, ?,null,?,null,?,?)`);
const insUnit = db.prepare(`INSERT INTO units (item_id,serial,status,location,custodian,last_transfer_date,purchase_date,property_no) VALUES (?,?,?,?,?,?,?,?)`);
const insCase = db.prepare(`INSERT OR IGNORE INTO cases (case_no) VALUES (?)`);

// cache: (name+spec) → item_id
const itemCache = {};
let lastCats = ['', '', '', ''];

for (const r of rows) {
  if (!r[11] && !r[8]) continue; // skip empty rows
  // carry forward cat values
  if (r[0]) lastCats[0] = r[0]; if (r[2]) lastCats[1] = r[2];
  if (r[4]) lastCats[2] = r[4]; if (r[6]) lastCats[3] = r[6];

  const name = (r[11] || '').trim();
  const spec = (r[12] || '').trim();
  const serial = (r[8] || '').trim();
  const code = (r[10] || '').trim();
  const price = parsePrice(r[14]);
  const purchaseDate = parseDate(r[15]);
  const custodian = (r[16] || '').trim();
  const transferDate = parseDate(r[17]);
  const borrower = (r[18] || '').trim();
  const location = (r[19] || '').trim();
  const note = (r[20] || '').trim();
  const propertyNo = (r[21] || '').trim();

  if (!name) continue;

  // create or find item
  const key = name + '|' + spec;
  let itemId = itemCache[key];
  if (!itemId) {
    const info = insItem.run(lastCats[0]||null, lastCats[1]||null, lastCats[2]||null, lastCats[3]||null,
      code||null, name, spec, price, note || null);
    itemId = info.lastInsertRowid;
    itemCache[key] = itemId;
    stats.items++;
  }

  const status = determineStatus(location, note, borrower, transferDate);
  const unitLoc = location === '公司' ? '倉庫' : (location || null);
  const unitCust = (custodian === '公司' || !custodian) ? (borrower || null) : custodian;

  insUnit.run(itemId, serial || null, status, unitLoc, unitCust, transferDate, purchaseDate, propertyNo || null);
  stats.units++;

  // extract case_no from location or note
  const caseNo = extractCaseNo(location) || extractCaseNo(note);
  if (caseNo) { insCase.run(caseNo); stats.cases++; }
}
console.log(`  items(equipment): ${stats.items}, units: ${stats.units}, cases: ${stats.cases}`);

// ── 2. 匯入耗材（各耗材表） ──
console.log('\n=== 匯入耗材表 ===');

// Generic function to parse pivot-format consumable sheets
function migrateConsumable(sheetName, skuStartCol, nameRowIdx, specRowIdx, stockKeywords) {
  const s = wb.Sheets[sheetName];
  if (!s) { console.log(`  [跳過] ${sheetName} 不存在`); return; }
  const sr = XLSX.utils.sheet_to_json(s, { header: 1, raw: false, defval: '' });
  console.log(`  ${sheetName}: ${sr.length} rows`);

  const insConsItem = db.prepare(`INSERT INTO items (kind,cat1,cat2,cat3,cat4,code,name,aliases,spec,unit,price,note) VALUES ('consumable',null,null,null,null,null,?,null,?,?,null,?)`);
  const insStock = db.prepare(`INSERT INTO stock (item_id,condition,qty,safety_qty) VALUES (?,?,?,0) ON CONFLICT(item_id,condition) DO UPDATE SET qty=excluded.qty`);

  // find SKU columns from header rows
  const nameRow = sr[nameRowIdx] || [];
  const specRow = sr[specRowIdx] || [];
  const skuCols = [];
  for (let c = skuStartCol; c < nameRow.length; c++) {
    const nm = (nameRow[c] || '').trim();
    if (nm) skuCols.push({ col: c, name: nm, spec: (specRow[c] || '').trim() });
  }

  // find stock row
  let stockRow = null;
  for (const row of sr) {
    const label = (row[3] || row[4] || row[2] || '').toString();
    if (stockKeywords.some(kw => label.includes(kw))) { stockRow = row; break; }
  }
  // also check last rows for "總數量"
  if (!stockRow) {
    for (let i = sr.length - 1; i >= 0; i--) {
      const label = (sr[i][3] || sr[i][4] || sr[i][2] || '').toString();
      if (label.includes('總數量') || label.includes('總計') || label.includes('結餘')) { stockRow = sr[i]; break; }
    }
  }

  let count = 0;
  for (const sku of skuCols) {
    const itemName = sku.name;
    const spec = sku.spec;
    const key = itemName + '|' + spec;
    let itemId = itemCache[key];

    if (!itemId) {
      const info = insConsItem.run(itemName, spec, null, `遷移自${sheetName}`);
      itemId = info.lastInsertRowid;
      itemCache[key] = itemId;
      stats.items++;
    }

    // get stock qty
    let qty = 0;
    if (stockRow) {
      const raw = stockRow[sku.col];
      const n = parseInt(String(raw).replace(/[, ]/g, '')) || 0;
      qty = n;
    }

    // determine condition: if column header includes "待修" → repair
    const isRepair = (itemName + spec).includes('待修') || (itemName + spec).includes('壞');
    insStock.run(itemId, isRepair ? 'repair' : 'good', qty);
    stats.stock++;
    count++;
  }
  console.log(`    SKU: ${count}, stock rows: ${count}`);
  return count;
}

// 二重管2023-08-21: H0 has SKU names at col 4+, H1 has specs
migrateConsumable('二重管2023-08-21', 4, 0, 1, ['原庫存量', '剩餘', '庫存量']);

// 雙簧塞: H0 has "雙簧塞" at col 4, H1 has spec "51"
migrateConsumable('雙簧塞', 4, 0, 1, ['原庫存量', '總數量', '剩餘']);

// SP4耗材: H0 has SKU names at col 5+, H1 has units, H2 has 庫存量
migrateConsumable('SP4耗材', 5, 0, 1, ['庫存量']);

// 材料: H0 has names at col 5+, H1 has specs
migrateConsumable('材料', 5, 0, 1, ['庫存量']);

// 安衛交通器材: H0 has names at col 5+, H1 has specs, H2 has 剩餘庫存量
migrateConsumable('安衛交通器材', 5, 0, 1, ['剩餘庫存量', '庫存量']);

// 套管2023-08-21: H0 names at col 4+
migrateConsumable('套管2023-08-21', 4, 0, 1, ['剩餘量', '剩餘', '庫存量']);

// 其它管材: H0 names at col 4+
migrateConsumable('其它管材', 4, 0, 1, ['原庫存量', '庫存量']);

// 其它鐵材設備: H0 names at col 5+
migrateConsumable('其它鐵材設備', 5, 0, 1, ['庫存量']);

// 施工架: H0 names at col 4+
migrateConsumable('施工架', 4, 0, 1, ['剩餘庫存量', '庫存量']);

// ── 3. 比對報告 ──
console.log('\n=== 遷移結果 ===');
const eqItems = db.prepare(`SELECT COUNT(*) AS c FROM items WHERE kind='equipment'`).get().c;
const consItems = db.prepare(`SELECT COUNT(*) AS c FROM items WHERE kind='consumable'`).get().c;
const units = db.prepare(`SELECT COUNT(*) AS c FROM units`).get().c;
const stockRows = db.prepare(`SELECT COUNT(*) AS c FROM stock`).get().c;
const cases = db.prepare(`SELECT COUNT(*) AS c FROM cases`).get().c;
const statusCounts = db.prepare(`SELECT status, COUNT(*) AS c FROM units GROUP BY status`).all();

console.log(`  items(equipment): ${eqItems}  (Excel 總明細表: ${rows.length} rows)`);
console.log(`  items(consumable): ${consItems}`);
console.log(`  units: ${units}`);
console.log(`  stock rows: ${stockRows}`);
console.log(`  cases: ${cases}`);
console.log(`  unit status breakdown:`);
for (const s of statusCounts) console.log(`    ${s.status}: ${s.c}`);

db.close();
console.log('\n遷移完成。');
