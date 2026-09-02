import express from 'express';
import { getDb } from './db.js';
import { requireAuth, checkCredentials, createSession, destroySession, getToken, COOKIE_NAME } from './auth.js';
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

// 認證：保護所有路由（login/health/static login 資產除外，見 src/auth.js）
app.use(requireAuth);

// 登入：帳密正確則發 session cookie
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!checkCredentials(username || '', password || '')) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }
  const token = createSession();
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ ok: true });
});

// 登出：清除 session
app.post('/api/logout', (req, res) => {
  destroySession(getToken(req));
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

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
