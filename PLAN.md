# 設備管理系統（warehouse）— 實施計劃

> 配套：`README.md`（設計）、`design.md`（界面）、`docs/superpowers/specs/2026-08-29-warehouse-system-design.md`（規格）
> 更新日期：2026-08-30

本檔追蹤三部分（Part 2 中台 / Part 1 輸入 skill / Part 3 查詢 skill）的實施進度。每步驟標記狀態：✅完成 / ⏳進行中 / ⬜待做。

---

## 進度總覽

| 部分 | 進度 | 說明 |
|---|---|---|
| Part 2 中台 | ██████████ 100% | 全部完成（含遷移腳本，已匯入真實資料） |
| Part 1 輸入 skill | ██████████ 100% | SKILL.md 已建立＋驗證通過（1/6/10.jpg 三種類型測試） |
| Part 3 查詢 skill | ██████████ 100% | SKILL.md 已建立＋驗證通過（5類自然語言查詢測試） |

---

## Part 2 中台

### 階段 P2-1：骨架 ✅
- [x] `package.json`（express / better-sqlite3 / multer）
- [x] `src/schema.sql`：11 張資料表（items/units/slips/slip_items/movements/stock/cases/users/audit_log/slip_photos）
  - 含 custodian、last_transfer_date、stock 分桶（good/repair/scrapped）、batch_no、safety_qty
  - slips 含 to_case_no、from_person（轉移用）
  - movements 含 from_person、to_person、qty（轉移雙方負責人）
- [x] `src/db.js`：SQLite 連線＋ schema 自動載入
- [x] `src/loadEnv.js`：.env 讀取（免 dotenv）
- [x] `src/server.js`：Express，綁定 `127.0.0.1:8088`（環境變數可改）
- [x] `start.sh`：UNIX 啟動腳本
- [x] `.env.example` / `.gitignore`
- [x] `scripts/init-db.js`：重建 schema
- [x] `scripts/seed.js`：測試資料播種

### 階段 P2-2：寫入交易與 API ✅
- [x] `src/services/writeTransaction.js`：`confirmSlip()` 單一交易
  - 設備：unit 狀態/地點/保管人/轉出日更新
  - 無編號：`new_serial=true` → 開新 unit（同 item 下一流水號）
  - 耗材：stock +/-（依 type），condition 依 condition_note 分桶
  - 每明細產生 movements 一筆
  - transfer 不改變耗材總量
  - **轉移產生2筆 movements**（主紀錄含雙方 + transfer_out 移交紀錄）
- [x] `POST /api/items`（建立物料）
- [x] `POST /api/items/:id/units`（建立設備個體）
- [x] `POST /api/slips`（建立進出單，含 to_case_no/from_person，draft 或 confirmed）
- [x] `POST /api/slips/:id/confirm`
- [x] 案號自動補入 cases 表
- [x] 單號自動產生（S-YYYY-0001）

### 階段 P2-3：查詢 API ✅
- [x] `GET /api/items`（autocomplete，品名/別名/代碼/規格）
- [x] `GET /api/items/:id`
- [x] `GET /api/units`（status/item/location 篩選）
- [x] `GET /api/units/:id/history`（單機歷史卡＋summary）
- [x] `GET /api/slips`（多條件：date/from/to/case/type/borrower/item/unit）
- [x] `GET /api/slips/:id`（明細＋照片）
- [x] `GET /api/movements`（多條件）
- [x] `GET /api/stock`（含 low 低庫存）
- [x] `GET /api/cases`（案場列表）
- [x] `POST /api/cases` / `PATCH /api/cases/:no`
- [x] `GET /api/dashboard`（重新設計：a.使用最多器材 b.耗材本週 c.整體概況）
- [x] 統一 JSON 回傳格式（query/count/rows/summary）

### 階段 P2-4：照片上傳 API ✅
- [x] `POST /api/slips/photos`（multer → photos/，關聯 slip_photos）
- [x] `GET /photos/:filename`（靜態存取）

### 階段 P2-5：前端 UI ✅
- [x] `public/index.html`：頂欄＋側欄（含設備設置頁）＋主區框架
- [x] `public/app.css`：design.md 配色 token 實作（CSS 變數、響應式）
- [x] **儀表板**：6 張概覽卡（設備總數/在庫/在外/待修/超30天/低庫存）＋ 使用最多器材 TOP10 ＋ 耗材本週列表 ＋ 最近異動
- [x] **快速開單**：類型選擇（含轉移欄位：來源案號/目的地案號/移交人/接收人）、日期、案號 autocomplete、品名 autocomplete、明細批次、確認入帳/存草稿
- [x] **進出單列表**：多條件搜尋（案號/類型/日期區間）、點擊看明細+照片、草稿可確認入帳
- [x] **設備列表**：狀態/地點篩選、狀態 badge、點擊看單機歷史卡
- [x] **耗材庫存**：低庫存篩選、狀態分桶、安全庫存警示
- [x] **異動紀錄**：多條件搜尋、CSV 匯出
- [x] **報表**：期間/案號/類型/分組、流入流出聚合、CSV 匯出
- [x] **設備設置**：新增器材（設備/耗材）、初始庫存設定、庫存調整（+/-）、器材編輯、設備個體新增
- [x] 載入/空/錯誤/toast 狀態設計
- [x] 響應式（768px/1024px 斷點）

### 階段 P2-6：PATCH 修改＋audit_log ✅
- [x] `PATCH /api/items/:id`
- [x] `PATCH /api/units/:id`
- [x] `PATCH /api/slips/:id` + `PATCH /api/slips/:id/items/:itemId`
- [x] `PATCH /api/stock/:itemId`
- [x] `POST /api/stock`（upsert）、`POST /api/stock/adjust`（增減＋movements）
- [x] audit_log 自動記錄（舊值→新值 JSON）

### 階段 P2-7：遷移腳本 ✅
- [x] `scripts/migrate.mjs`（用 xlsx 库读 .xls，免 Excel COM）
- [x] 读總明細表 → items(equipment) + units（custodian/last_transfer_date 快照）
- [x] 读各耗材表（每欄=SKU）→ items(consumable) + stock（good/repair 桶，upsert）
- [x] 读 cases（散落案號）→ cases 表
- [x] 迁移后比对报告（输出数量 vs Excel 列数、状态分布）
- [x] 已用真实 .xls 数据验证：494 设备品项、1334 units、117 耗材 SKU、147 案場

### 階段 P2-8：報表＋CSV ✅
- [x] `GET /api/movements/movements?format=csv`（分組聚合 CSV）
- [x] `GET /api/movements/export`（異動明細 CSV，含 BOM 供 Excel 中文）
- [x] 前端報表頁：期間/案號/類型/分組篩選 → 表格 → 下載 CSV

### 階段 P2-9：設備轉移（雙方負責人）✅
- [x] slips 新增 `to_case_no`、`from_person` 欄位
- [x] movements 新增 `from_person`、`to_person`、`qty` 欄位
- [x] 轉移產生 2 筆 movements（主紀錄 + transfer_out 移交紀錄）
- [x] 快速開單 UI：轉移時顯示來源案號/目的地案號/移交人/接收人
- [x] Unit 地點更新為 to_case_no，保管人更新為接收人

### 階段 P2-10：DELETE + 異動紀錄編輯 ✅
- [x] `DELETE /api/slips/:id`（連明細＋異動＋照片，audit_log）
- [x] `DELETE /api/slips/:id/items/:itemId`（刪明細列）
- [x] `DELETE /api/items/:id`（有 units/slips 關聯則拒絕）
- [x] `DELETE /api/units/:id`
- [x] `DELETE /api/stock/:itemId`
- [x] `DELETE /api/movements/:id`
- [x] `DELETE /api/cases/:caseNo`（有進出單則拒絕）
- [x] `PATCH /api/movements/:id`（日期/類型/數量/來源/目的地/經手人/備註）
- [x] 前端所有列表頁加 ✎編輯＋✕刪除按鈕
- [x] 異動紀錄列表加編輯/刪除

### 階段 P2-11：報表篩選強化 ✅
- [x] 報表 API 加 `slip_no` 參數（JOIN slips 表匹配單號）
- [x] 前端報表頁加「案號」「單號」輸入欄位
- [x] CSV 匯出帶案號/單號篩選

### 階段 P2-12：Windows 啟動＋照片 API 實測 ✅
- [x] `start.bat`（Windows 雙擊啟動，獨立視窗常駐，不隨 shell 結束）
- [x] 照片 API 實測：`POST /api/slips/photos`（multipart photo+slip_id）回傳 id/filename；`GET /api/slips/:id` 回傳 photos[]；`GET /photos/:filename` 200
- [x] 1.jpg 已關聯 S-2026-0001

---

## Part 1 輸入 Agent skill ⏳

### 階段 P1-1：skill 建立 ✅
- [x] `.opencode/skills/warehouse-entry/SKILL.md`
- [x] 命名註明：英文 `warehouse`、中文「設備管理系統」
- [x] draft JSON schema（日期/案號/類型/明細[品名,數量,編號,狀況]/簽名人）
- [x] 工作流指令：讀照片 → 產草稿 → `GET /api/items` 匹配正名/別名 → 終端確認 → `POST /api/slips`(+photos) → `/confirm` → 回報新編號
- [x] RESTRAIN：不跳過確認、不猜 item_id、無編號開新號、出+回拆兩單、不答查詢
- [x] 與查詢 skill 提示詞區隔（ROLE/RESTRAIN 明確不同）

### 階段 P1-2：驗證 ✅
- [x] 以 1.jpg 走 skill 流程建單 → S-2026-0001（return 回倉）：鑽機#21→in_stock、洗車機開新號、雙簧塞+4
- [x] 以 6.jpg 走 skill 流程建單 → S-2026-0002（repair_out 送修）：發電機→repair、condition_note="無法啟動"
- [x] 以 10.jpg 走 skill 流程建單 → S-2026-0003（transfer 轉移）：鑽機#21→24-014、2筆movements、雙方負責人
- [x] 類型推斷正確（return/repair_out/transfer 三種均驗證）
- [x] 品名/別名匹配（洗網機→洗車機 via aliases）
- [x] 無編號開新號（洗車機 new_serial=true）
- [x] 轉移產生2筆 movements（transfer + transfer_out）
- [x] 儀表板聚合正確（top_equiment/recent 更新）

---

## Part 3 查詢 Agent skill ⏳

### 階段 P3-1：skill 建立 ✅
- [x] `.opencode/skills/warehouse-query/SKILL.md`
- [x] 命名註明
- [x] 查詢 API 對照表（意圖→API→參數）
- [x] 編號→unit_id 轉換流程
- [x] 意圖解析指令（目標物件＋條件＋隱含條件）
- [x] 結果整理指令（summary＋表格＋行動建議＋多輪追問）
- [x] RESTRAIN：絕不寫入（不呼叫 POST/PATCH/DELETE）、絕不虛構、參數不確定就問
- [x] 與輸入 skill 提示詞區隔（ROLE/RESTRAIN 明確不同）

### 階段 P3-2：驗證 ✅
- [x] 「鑽機#21 最近三次去哪」→ 3筆異動（return/transfer/transfer_out），目前24-014
- [x] 「26-023 案場未回設備」→ 5台在外（泥水比重秤#04/洗車機#20/分流器#11等）
- [x] 「二重管低於5支的規格」→ 6個SKU中3個低於5（60二重管=0/1M=2/60二重管3m=0）
- [x] 「整體概況」→ summary 正確（1335台/651在庫/349在外/60待修）
- [x] 「最近異動」→ 6筆含轉移雙方紀錄

---

## 驗收標準

| 項目 | 標準 | 狀態 |
|---|---|---|
| 寫入交易 | 確認入帳後 units/movements/stock 同步正確；無編號開新號；轉移不減庫存 | ✅ 已驗證 |
| 轉移雙方負責人 | 轉移產生2筆 movements；unit 地點/保管人更新 | ✅ 已驗證 |
| 儀表板 | a.使用最多器材 b.耗材本週 c.整體概況 | ✅ 已驗證 |
| PATCH + audit_log | 修改留 audit_log | ✅ 已驗證 |
| DELETE + audit_log | 刪除留 audit_log（slips 連帶刪明細/異動/照片） | ✅ 已驗證 |
| 異動紀錄編輯 | PATCH/DELETE movements（含 slip_id 來源的） | ✅ 已驗證 |
| 報表 CSV | 分組聚合 + 明細匯出（含 BOM） | ✅ 已驗證 |
| 報表篩選 | 案號 + 單號篩選 | ✅ 已驗證 |
| 設備設置 | 新增器材/初始庫存/增減調整 | ✅ 已驗證 |
| 遷移 | items/units 數量＝總明細表列數；stock＝各耗材表結餘 | ✅ 已驗證（494品項/1334units/117耗材/147案場） |
| Part 1 skill | 3 張照片經 skill 建單，結果與人工判讀一致 | ✅ 已驗證 |
| Part 3 skill | 5 類自然語言查詢正確回覆 | ✅ 已驗證 |
| UI 遵循 design.md | 響應式；含載入/空/錯誤/toast 狀態 | ✅ 已完成 |

---

## 下一步建議順序

1. ~~P2-5 前端 UI~~ ✅
2. ~~P2-6 PATCH + audit_log~~ ✅
3. ~~P2-8 報表/CSV~~ ✅
4. ~~P2-9 設備轉移~~ ✅
5. ~~P2-7 遷移腳本~~ ✅
6. ~~P1-2 輸入 skill 驗證~~ ✅
7. ~~P3-2 查詢 skill 驗證~~ ✅
8. **全部完成** 🎉
9. **文檔固化**（README/MANUAL/PLAN/規格 更新為定稿，2026-08-30）✅
