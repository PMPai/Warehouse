import { randomBytes, timingSafeEqual } from 'node:crypto';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Jines2355';

export const COOKIE_NAME = 'wh_session';

const sessions = new Map();

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function checkCredentials(user, pass) {
  return safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASS);
}

export function createSession() {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { user: ADMIN_USER, created: Date.now() });
  return token;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function getToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

function validBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  return checkCredentials(decoded.slice(0, idx), decoded.slice(idx + 1));
}

const PUBLIC_PATHS = new Set(['/login.html', '/app.css', '/api/login', '/api/health']);

export function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (validBasicAuth(req.headers.authorization)) return next();
  const token = getToken(req);
  if (token && sessions.has(token)) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.redirect('/login.html');
}
