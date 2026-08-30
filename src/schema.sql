-- 設備管理系統 schema（warehouse）
-- SQLite

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 單一操作者（無角色、無密碼；audit_log 記錄用）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  operator TEXT NOT NULL DEFAULT '管理員'
);
INSERT OR IGNORE INTO users (id, operator) VALUES (1, '管理員');

-- 案場主檔
CREATE TABLE IF NOT EXISTS cases (
  case_no TEXT PRIMARY KEY,
  name TEXT,
  status TEXT DEFAULT 'active'
);

-- 物料主檔（設備＋數量類耗材合一）
-- 耗材 SKU 建模：每個(品名+規格)組合 = 一條 items 列
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('equipment','consumable')),
  cat1 TEXT, cat2 TEXT, cat3 TEXT, cat4 TEXT,
  code TEXT,
  name TEXT NOT NULL,
  aliases TEXT,            -- 分隔字串，如 "洗網機,洗車機"
  spec TEXT,
  unit TEXT,
  price REAL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);

-- 設備個體（僅 equipment）
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  serial TEXT,             -- 編號 #21
  status TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (status IN ('in_stock','out','repair','scrapped','lost','out_pending_cleanup')),
  location TEXT,           -- 放置地點（倉庫名/案號）
  custodian TEXT,          -- 保管人/轉借人
  last_transfer_date TEXT, -- 轉出日期
  purchase_date TEXT,
  property_no TEXT,        -- 財編
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_units_item ON units(item_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);

-- 進出單頭
CREATE TABLE IF NOT EXISTS slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT UNIQUE,          -- S-2026-0001
  type TEXT NOT NULL CHECK (type IN ('out','in','return','transfer','scrap','repair_out','repair_back')),
  date TEXT NOT NULL,
  case_no TEXT REFERENCES cases(case_no),       -- 案號（出倉/回倉/進倉/送修/修回用；轉移=來源案號）
  to_case_no TEXT REFERENCES cases(case_no),     -- 轉移目的地案號（僅 transfer；其他為 NULL）
  borrower TEXT,           -- 借用人/簽名人/接收人
  from_person TEXT,        -- 移交人（僅 transfer；A 案場負責人）
  confirmer TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ocr','manual')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_slips_date ON slips(date);
CREATE INDEX IF NOT EXISTS idx_slips_case ON slips(case_no);
CREATE INDEX IF NOT EXISTS idx_slips_type ON slips(type);

-- 進出單明細
CREATE TABLE IF NOT EXISTS slip_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id INTEGER NOT NULL REFERENCES slips(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  unit_id INTEGER REFERENCES units(id),  -- 設備明細才有；耗材為 NULL
  qty INTEGER NOT NULL DEFAULT 1,
  from_loc TEXT,
  to_loc TEXT,
  condition_note TEXT,     -- 壞/待修/無編號 等狀況
  new_serial INTEGER NOT NULL DEFAULT 0,  -- 1=此列開新編號
  batch_no TEXT            -- 批號/lot（如雙簧塞 03439白）
);
CREATE INDEX IF NOT EXISTS idx_slip_items_slip ON slip_items(slip_id);
CREATE INDEX IF NOT EXISTS idx_slip_items_item ON slip_items(item_id);

-- 異動紀錄（＝現「異動總表明細」，自動產生）
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id INTEGER REFERENCES slips(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  unit_id INTEGER REFERENCES units(id),
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,            -- 數量（設備=1，耗材=進出數量）
  from_loc TEXT,
  to_loc TEXT,
  person TEXT,              -- 經手人（出倉=借用人；轉移=接收人）
  from_person TEXT,         -- 移交人（轉移用）
  to_person TEXT,           -- 接收人（轉移用）
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_movements_unit ON movements(unit_id);
CREATE INDEX IF NOT EXISTS idx_movements_item ON movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(date);

-- 耗材庫存（按狀態分桶）
CREATE TABLE IF NOT EXISTS stock (
  item_id INTEGER NOT NULL REFERENCES items(id),
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','repair','scrapped')),
  qty INTEGER NOT NULL DEFAULT 0,
  safety_qty INTEGER DEFAULT 0,   -- 安全庫存（低庫存警示用）
  PRIMARY KEY (item_id, condition)
);

-- 修改紀錄
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
  tbl TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  old_json TEXT,
  new_json TEXT
);

-- 照片與單的關聯
CREATE TABLE IF NOT EXISTS slip_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id INTEGER NOT NULL REFERENCES slips(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_slip_photos_slip ON slip_photos(slip_id);
