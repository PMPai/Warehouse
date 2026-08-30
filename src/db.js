import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadConfig() {
  const dbPath = process.env.WAREHOUSE_DB || 'data/warehouse.db';
  const photosDir = process.env.WAREHOUSE_PHOTOS_DIR || 'photos';
  return {
    dbPath: join(root, dbPath),
    photosDir: join(root, photosDir),
  };
}

let _db = null;

export function getDb() {
  if (_db) return _db;
  const { dbPath, photosDir } = loadConfig();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(photosDir)) mkdirSync(photosDir, { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  _db.exec(schema);
  return _db;
}

export function getPhotosDir() {
  return loadConfig().photosDir;
}
