import express from 'express';
import { getDb } from './db.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from './loadEnv.js';

dotenvConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const HOST = process.env.WAREHOUSE_HOST || '127.0.0.1';
const PORT = Number(process.env.WAREHOUSE_PORT) || 8088;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 靜態前端
const publicDir = join(root, 'public');
if (existsSync(publicDir)) app.use(express.static(publicDir));
app.use('/photos', express.static(join(root, process.env.WAREHOUSE_PHOTOS_DIR || 'photos')));

// API 路由
app.use('/api/items', (await import('./routes/items.js')).default);
app.use('/api/units', (await import('./routes/units.js')).default);
app.use('/api/slips', (await import('./routes/slips.js')).default);
app.use('/api/movements', (await import('./routes/movements.js')).default);
app.use('/api/stock', (await import('./routes/stock.js')).default);
app.use('/api/dashboard', (await import('./routes/dashboard.js')).default);
app.use('/api/cases', (await import('./routes/cases.js')).default);

app.get('/api/health', (_req, res) => {
  const db = getDb();
  const counts = db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM items) AS items,
      (SELECT COUNT(*) FROM units) AS units,
      (SELECT COUNT(*) FROM slips) AS slips,
      (SELECT COUNT(*) FROM movements) AS movements`
  ).get();
  res.json({ status: 'ok', ...counts });
});

// 首頁 → public/index.html
app.get('/', (_req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

getDb();

app.listen(PORT, HOST, () => {
  console.log(`設備管理系統（warehouse）中台啟動：http://${HOST}:${PORT}`);
});
