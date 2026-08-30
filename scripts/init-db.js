// 重新初始化資料庫（刪除後重建 schema）
import { getDb } from '../src/db.js';
import { unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dbPath = process.env.WAREHOUSE_DB || 'data/warehouse.db';
const full = join(root, dbPath);

if (existsSync(full)) {
  console.log('刪除既有 DB:', full);
  unlinkSync(full);
}
const db = getDb();
console.log('schema 初始化完成。資料表：');
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
for (const t of tables) console.log(' -', t.name);
process.exit(0);
