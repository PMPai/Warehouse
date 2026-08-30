# 倉庫進出倉管理系統 — 設計規格

日期：2026-08-29（最後更新：2026-08-30）
狀態：**全部完成並固化**（2026-08-30 定稿）— Part 2 中台 100% / Part 1 輸入 skill 驗證通過 / Part 3 查詢 skill 驗證通過 / 照片 API 實測通過。
配套檔案：`README.md`（完整設計＋進度）、`MANUAL.md`（使用手冊）、`design.md`（界面風格）、`PLAN.md`（實施計劃）。

## 0. 三部分架構

系統分為三個獨立協作部分：

- **Part 1 輸入 Agent**（opencode）：手寫單照片 OCR → 推斷異動類型 → 確認為標準格式 → 調度 API 提交紀錄到中台。對應 skill `warehouse-entry`。
- **Part 2 中台 DB**（UNIX 伺服器獨立服務）：獨立資料庫，同時接受網頁與 API 呼叫；記錄所有庫存器材與每次進出；完整儀表板、報表、編輯刪除。Node+Express+SQLite，綁定 host:port（開發 `127.0.0.1:8088`，正式改伺服器 IP）。
- **Part 3 查詢 Agent**（opencode）：自然語言建立查找條件 → 呼叫查詢 API → 整理結果回覆。對應 skill `warehouse-query`。

Part 1 與 Part 3 皆透過同一組 REST API 與 Part 2 溝通；Part 2 不依賴任何 agent，可獨立運作。

## 1. 背景與現狀問題

現行以 `2026年資產明細表08-11.xls` 登記，含 15 張工作表（代碼、總明細表、異動總表明細 11k 筆、二重管、雙簧塞、SP4耗材、材料等）。原始單據來源：

- 正式進倉明細表/物料債務務申請表（打勾項才登記，如 1.jpg、3.jpg）
- 現場手寫紙本拍照回傳（2.jpg~10.jpg），字跡難判讀、出倉回倉同張、A 工地直轉 B 工地
- 設備編號磨損無法辨識（如 1.jpg 第62項洗網機）
- 特殊耗材（二重管、雙簧塞）另檔以 +/- 數量管理

痛點：判讀耗時、名稱不一致（洗網機=洗車機）、只登記最新狀態而異動總表漏複製、耗材需重複判讀、故障/待修無專屬欄位。

## 2. 已確認決策（訪談紀錄）

| 議題 | 決策 |
|---|---|
| 輸入角色 | 現場數位申報（拍照回傳）＋ 登記人確認 |
| 部署 | UNIX 伺服器，綁定 host:port（開發 `127.0.0.1:8088`，未來改伺服器 IP） |
| OCR | 外部 agent（opencode）判讀＋系統 REST API 寫入 |
| 異動類型 | 出倉/進倉、回倉、工地間轉移、報廢、送修/修回 |
| 無編號設備 | 回倉一律開新號，舊號留「在外-待清理」 |
| 耗材範圍 | 全部數量類物料（二重管/雙簧塞/SP4/材料表） |
| 遷移 | 主檔＋庫存；歷史異動留舊 Excel |
| 權限 | 單一使用者，不區分角色；API 不做權限限制 |
| 附加 | 儀表板（a.使用最多器材 b.耗材本週 c.整體概況）＋報表＋CSV匯出 |
| 系統方案 | 方案 A：Web（Node+Express+SQLite），部署 UNIX 伺服器，`start.sh` 啟動 |
| 畫面順序 | ①儀表板 ②快速開單 ③列表（進出單/設備/耗材/異動）④報表 ⑤設備設置 |
| 轉移雙方負責人 | 轉移須記錄移交人（A 案場）＋接收人（B 案場）；產生2筆 movements |
| 編輯刪除 | 所有記錄可 PATCH/DELETE，全部留 audit_log |
| 類型推斷 | 手寫單不標注類型，skill 從內容推斷，經手人確認 |
| 報表篩選 | 支援案號＋單號篩選 |

## 3. 整體流程

### 流程 A：照片進出倉（主流程）
1. 現場拍 handwritten/正式單 → LINE 回傳
2. 登記人把照片交給輸入 Agent
3. Agent OCR → **推斷異動類型**（手寫單不標注類型，從內容推斷）→ 進出單草稿（日期/案號/類型/明細[品名,數量,編號,狀況]/簽名人）
4. **確認流程（兩階段）**：5a 先確認異動類型（不確定時列選項讓經手人選）；5b 逐項確認品名匹配、數量、無編號開新號、狀況備註
5. 確認 → Agent POST /api/slips ＋ /confirm → 單一交易寫入 units/movements/stock/slips
6. 歸檔可追溯（含照片）

### 流程 B：手動快速開單
類型選擇（含轉移欄位：來源案號/目的地案號/移交人/接收人）＋案號 autocomplete＋日期＋借用人；明細 autocomplete（別名/編號命中），Enter 新增。儲存走同一寫入交易。

### 流程 C：工地間轉移
單類型=轉移，明細帶 from案→to案，不經倉庫庫存（耗材總量不變）。產生2筆 movements（主紀錄含雙方負責人 + transfer_out 移交紀錄）。unit 地點更新為 to_case_no，保管人更新為接收人。

### 流程 D：管理後台
儀表板（a.使用最多器材TOP10 b.耗材本週列表 c.整體概況卡＋最近異動）、報表（期間/案號/單號/類型/分組 → CSV）、單機歷史卡；所有記錄可 PATCH/DELETE，留 audit_log。

## 4. 資料模型（SQLite schema）

```sql
-- 物料主檔（設備＋數量類耗材合一）
-- 耗材 SKU 建模：每個(品名+規格)組合 = 一條 items 列
items(id PK, kind CHECK('equipment','consumable'),
      cat1,cat2,cat3,cat4, code,          -- 沿用 Ⅰ-Ⅱ-Ⅲ-Ⅳ 代碼體系
      name, aliases, spec, unit, price, note)

-- 設備個體（僅 equipment）
units(id PK, item_id FK, serial,          -- 編號 #21
      status CHECK('in_stock','out','repair','scrapped','lost','out_pending_cleanup'),
      location,                            -- 放置地點（倉庫/案號）
      custodian,                           -- 保管人/轉借人
      last_transfer_date,                  -- 轉出日期
      purchase_date, property_no)

-- 進出單頭
slips(id PK, no,                           -- 單號 S-2026-0001
      type CHECK('out','in','return','transfer','scrap','repair_out','repair_back'),
      date, case_no,                       -- 案號（轉移=來源案號A）
      to_case_no,                          -- 轉移目的地案號（僅 transfer）
      borrower,                            -- 借用人/接收人（轉移=B 案場負責人）
      from_person,                         -- 移交人（僅 transfer，A 案場負責人）
      confirmer,
      source CHECK('ocr','manual'), status CHECK('draft','confirmed'),
      note, created_at)

-- 進出單明細（一張單多列）
slip_items(id PK, slip_id FK, item_id FK, unit_id NULL FK,
           qty, from_loc, to_loc, condition_note, new_serial BOOL,
           batch_no)                      -- 批號/lot（如雙簧塞 03439白，可選）

-- 異動紀錄（＝現「異動總表明細」，自動產生）
movements(id PK, slip_id FK, item_id FK, unit_id NULL,
          type, date, qty,                 -- 數量（設備=1，耗材=進出數量）
          from_loc, to_loc,
          person,                          -- 經手人/接收人
          from_person,                     -- 移交人（轉移用）
          to_person,                       -- 接收人（轉移用）
          note)

-- 耗材庫存（按狀態分桶）
stock(item_id PK/FK, condition CHECK('good','repair','scrapped'), qty,
      safety_qty,                          -- 安全庫存（低庫存警示用）
      PRIMARY KEY(item_id, condition))

-- 案場主檔
cases(case_no PK, name, status)

-- 單一操作者（無角色區分，無密碼；audit_log 記錄用）
users(id PK, operator)

-- 修改紀錄（舊值→新值）
audit_log(id PK, user_id FK, tbl, row_id, changed_at, old_json, new_json)

-- 照片與單的關聯
slip_photos(id PK, slip_id FK, filename, created_at)
```

別名匹配：`items.aliases` 以分隔字串存（洗網機,洗車機），autocomplete 與 agent 共用。

耗材 SKU 建模：Excel 耗材表為樞紐格式（每欄＝一個品名+規格 SKU）。系統中每個(品名+規格)組合為一條獨立 `items` 列。耗材庫存 `stock` 按狀態分桶（good/repair/scrapped），對應 Excel 的「待修」「報廢」子庫存列。

## 5. API

### 5.1 寫入 API（Part 1 輸入 Agent 與網頁共用）
```
POST   /api/slips                建立進出單（draft 或 confirmed；含 to_case_no/from_person）
POST   /api/slips/:id/confirm    確認→寫入交易（units+movements+stock）
POST   /api/slips/photos         上傳照片並關聯 slip
PATCH  /api/slips/:id            修改進出單頭（audit_log）
PATCH  /api/slips/:id/items/:itemId   修改明細列（audit_log）
DELETE /api/slips/:id            刪除整張單（連明細＋異動＋照片，audit_log）
DELETE /api/slips/:id/items/:itemId   刪除明細列（audit_log）

POST   /api/items                建立物料
POST   /api/items/:id/units      建立設備個體
PATCH  /api/items/:id            修改物料（audit_log）
DELETE /api/items/:id            刪除物料（有 units/slips 關聯則拒絕，audit_log）

PATCH  /api/units/:id            修改設備個體（audit_log）
DELETE /api/units/:id            刪除設備個體（audit_log）

POST   /api/stock                設定庫存（upsert）
POST   /api/stock/adjust         庫存增減（delta，寫 movements，audit_log）
PATCH  /api/stock/:itemId        修改庫存數量/安全庫存（audit_log）
DELETE /api/stock/:itemId        刪除庫存桶（audit_log）

PATCH  /api/movements/:id        修改異動紀錄（audit_log）
DELETE /api/movements/:id        刪除異動紀錄（audit_log）

POST   /api/cases                新增案場
PATCH  /api/cases/:caseNo        修改案場
DELETE /api/cases/:caseNo        刪除案場（有進出單則拒絕）
```

### 5.2 查詢 API（Part 3 查詢 Agent 與網頁共用，回傳結構化 JSON 供 agent 解讀）
```
GET /api/items?q=&kind=                    品名/別名 autocomplete
GET /api/items/:id                         物料詳情
GET /api/units?status=&item=&location=     設備個體篩選
GET /api/units/:id/history                 單機歷史卡（所有異動＋關聯單＋照片）
GET /api/slips?date=&from=&to=&case=&type=&borrower=&item=&unit=   進出單多條件查詢
GET /api/slips/:id                         進出單明細＋照片
GET /api/movements?from=&to=&case=&type=&unit=&item=   異動紀錄查詢
GET /api/movements/movements?from=&to=&case=&type=&slip_no=&group=&format=csv   報表（分組聚合，含CSV）
GET /api/movements/export?from=&to=&case=&type=   異動明細 CSV 匯出（含BOM）
GET /api/stock?item=&low=                  耗材庫存（可低庫存警示）
GET /api/cases                             案場列表
GET /api/dashboard                         儀表板聚合
```
所有查詢 API 回傳統一 JSON：`{ "query": {...}, "count": n, "rows": [...], "summary": "..." }`，`summary` 為可讀文字摘要，供查詢 agent 直接轉述。

### 5.3 寫入交易語意（/confirm）
- 設備明細：unit 狀態/地點/保管人/轉出日更新；new_serial=true → 建新 unit（同 item 下一流水號）
- 耗材明細：stock.qty += (回倉/進倉) 或 -= (出倉)；轉移不改變總量
- **轉移特殊處理**：產生2筆 movements（主紀錄含雙方負責人 + transfer_out 移交紀錄）；unit 地點→to_case_no，保管人→接收人
- 每明細產生 movements 一筆（轉移除外，產生2筆）
- slip.status=confirmed
- 所有 PATCH/DELETE 均寫入 audit_log（舊值→新值 JSON）

## 6. UI 畫面

> 所有畫面遵循 `design.md` 界面風格規範。

1. **儀表板**：6張概覽卡（設備總數/在庫/在外/待修/超30天/低庫存）＋ 使用最多器材TOP10 ＋ 耗材本週列表 ＋ 最近異動
2. **快速開單**：類型選擇（含轉移欄位：來源案號/目的地案號/移交人/接收人）、日期、案號 autocomplete、品名 autocomplete、明細批次、確認入帳/存草稿
3. **進出單列表**：多條件搜尋（案號/類型/日期區間）、點擊看明細+照片、草稿可確認入帳、✎編輯、✕刪除
4. **設備列表**：狀態/地點篩選、狀態 badge、點擊看單機歷史卡、✎編輯、✕刪除
5. **耗材庫存**：低庫存篩選、狀態分桶、安全庫存警示、±調整、✎編輯、✕刪除
6. **異動紀錄**：多條件搜尋、CSV匯出、✎編輯、✕刪除
7. **報表**：期間/案號/單號/類型/分組篩選、流入流出聚合、CSV匯出
8. **設備設置**：新增器材（設備/耗材）、初始庫存設定、庫存調整（+/-）、器材編輯/刪除、設備個體新增

## 7. Part 1 — Agent skill `warehouse-entry`（輸入/OCR/確認/提交）

位置：`.opencode/skills/warehouse-entry/SKILL.md`（已建立）。
提示詞重點：
- ROLE 明確「只寫，不查詢」
- **類型推斷**：手寫單不標注類型，skill 從照片內容推斷（出=領/借/送；回=回/退/還/撤場；轉移=兩個案號並列；報廢=壞/作廢；送修=壞/故障/修），推斷結果在確認時讓經手人確認
- 工作流7步：1.讀照片 → 2.推斷異動類型（含推斷表+不確定時列選項） → 3.產草稿（含 type_confidence/type_alternatives） → 4.品名/別名匹配 → 5.呈現草稿供確認（5a先確認類型，5b逐項確認明細） → 6.寫入 → 7.回報
- RESTRAIN：不跳過確認、不猜 item_id、**類型必須由經手人確認**、類型不確定不硬選、轉移必須有雙方負責人、無編號開新號、出+回拆兩單

## 7b. Part 3 — Agent skill `warehouse-query`（自然語言查詢）

位置：`.opencode/skills/warehouse-query/SKILL.md`（已建立）。
提示詞重點：
- ROLE 明確「只讀，不寫」
- 查詢 API 對照表（意圖→API→參數）
- 編號→unit_id 轉換流程（先 items 再 units）
- 工作流：解析意圖（目標物件＋條件＋隱含條件）→ 呼叫 GET API → 用 summary＋表格整理 → 附行動建議 → 可多輪追問
- RESTRAIN：絕不寫入（不呼叫 POST/PATCH/DELETE）、絕不虛構、參數不確定就問

> 兩個 skill 提示詞刻意不同：輸入 skill 強調「謹慎確認後才寫」，查詢 skill 強調「唯讀整理不虛構」。

## 8. 遷移

一次性腳本 `scripts/migrate.mjs`：用 `xlsx` 库直接讀取舊 `.xls`（免 Excel COM，UNIX 可用）。

| 來源工作表 | 目的 |
|---|---|
| 總明細表 | → `items`(equipment) + `units`（含 custodian=保管人、last_transfer_date=轉出日期 快照；狀態自動推斷） |
| 二重管/雙簧塞/SP4/材料/安衛交通器材/套管/其它管材/其它鐵材設備/施工架（每欄=一品名+規格 SKU） | → `items`(consumable，每欄一列) + `stock`（剩餘庫存量→good 桶；待修列→repair 桶；upsert 避免重複） |
| 估價單/出+回倉 xlsx | → 參考用（歷史異動不遷移） |
| 異動總表明細 | **不遷移**（留舊 Excel 備查） |

遷移結果：494 設備品項、1334 units、117 耗材 SKU、147 案場。狀態分布：在庫650/在外350/待修59/報廢266/不見9。

## 9. 備份與維運

SQLite 單檔＋photos/；`start.sh` 啟動，綁定 host:port（開發 `127.0.0.1:8088`，由設定檔/環境變數控制，未來改伺服器 IP）；部署目標 UNIX 伺服器；可選 cron 每日備份 DB 檔。

## 10. 實施順序與進度

| 階段 | 狀態 | 說明 |
|---|---|---|
| P2-1 骨架 | ✅ | server + schema + start.sh + loadEnv + seed |
| P2-2 寫入交易 | ✅ | confirmSlip + 轉移2筆movements + 無編號開新號 |
| P2-3 查詢 API | ✅ | items/units/slips/movements/stock/cases/dashboard |
| P2-4 照片上傳 | ✅ | multer + slip_photos |
| P2-5 前端 UI | ✅ | 儀表板/快速開單/列表5頁/設備設置/報表 |
| P2-6 PATCH+audit_log | ✅ | items/units/slips/stock PATCH + audit_log |
| P2-7 遷移腳本 | ✅ | migrate.mjs（用 xlsx 库读 .xls，已匯入494品項/1334units/117耗材/147案場） |
| P2-8 報表+CSV | ✅ | 分組聚合 + 明細匯出 + 案號/單號篩選 |
| P2-9 設備轉移 | ✅ | 雙方負責人 + 2筆 movements |
| P2-10 DELETE+異動編輯 | ✅ | 全表 DELETE + movements PATCH/DELETE |
| P2-11 報表篩選強化 | ✅ | 案號 + 單號 |
| P1-1 輸入 skill 建立 | ✅ | warehouse-entry SKILL.md |
| P1-2 輸入 skill 驗證 | ✅ | 1.jpg(return)/6.jpg(repair_out)/10.jpg(transfer) 三種類型測試通過 |
| P3-1 查詢 skill 建立 | ✅ | warehouse-query SKILL.md |
| P3-2 查詢 skill 驗證 | ✅ | 5類查詢測試通過（設備歷史/案場設備/庫存/概況/最近異動） |

## 11. 驗證結果

### 遷移驗證 ✅
- items(equipment) 494、units 1334、items(consumable) 117、stock 117 桶、cases 147
- 狀態分布：在庫650/在外350/待修59/報廢266/不見9

### Part 1 輸入 skill 驗證 ✅
| 照片 | 類型 | 結果 |
|---|---|---|
| 1.jpg | return | S-2026-0001：鑽機#21→in_stock、洗車機開新號、雙簧塞+4 |
| 6.jpg | repair_out | S-2026-0002：發電機→repair、condition_note="無法啟動" |
| 10.jpg | transfer | S-2026-0003：鑽機#21→24-014、2筆movements、雙方負責人 |

### Part 3 查詢 skill 驗證 ✅
| 查詢 | 結果 |
|---|---|
| 鑽機#21 最近三次去哪 | 3筆異動（return/transfer/transfer_out），目前24-014 |
| 26-023 案場未回設備 | 5台在外 |
| 二重管低於5支 | 6 SKU 中 3 個低於5 |
| 整體概況 | summary 正確（1335台/651在庫/349在外/60待修） |
| 最近異動 | 6筆含轉移雙方紀錄 |

### 規則驗證 ✅
- 無編號開新號、轉移不減庫存、轉移產生2筆movements、audit_log（PATCH+DELETE）、報表案號/單號篩選均驗證通過
