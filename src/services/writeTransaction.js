import { getDb } from '../db.js';

/**
 * 確認進出單 → 寫入交易：一次交易內更新 units / movements / stock，slip.status=confirmed
 * @param {number} slipId
 * @returns {object} 結果摘要
 */
export function confirmSlip(slipId) {
  const db = getDb();
  const slip = db.prepare('SELECT * FROM slips WHERE id = ?').get(slipId);
  if (!slip) throw new Error(`slip ${slipId} not found`);
  if (slip.status === 'confirmed') throw new Error(`slip ${slipId} already confirmed`);

  const items = db.prepare('SELECT * FROM slip_items WHERE slip_id = ?').all(slipId);

  const tx = db.transaction(() => {
    const newUnits = [];
    for (const si of items) {
      const item = db.prepare('SELECT kind FROM items WHERE id = ?').get(si.item_id);
      if (!item) throw new Error(`item ${si.item_id} not found`);

      let unitId = si.unit_id;

      if (item.kind === 'equipment') {
        if (si.new_serial || !unitId) {
          // 開新編號：同 item 下一流水號
          const maxRow = db.prepare(
            'SELECT serial FROM units WHERE item_id = ? ORDER BY id DESC LIMIT 1'
          ).get(si.item_id);
          let next = 1;
          if (maxRow && maxRow.serial) {
            const m = String(maxRow.serial).match(/(\d+)$/);
            if (m) next = parseInt(m[1], 10) + 1;
          }
          const serial = String(next);
          const info = db.prepare(
            `INSERT INTO units (item_id, serial, status, location, custodian, last_transfer_date)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(si.item_id, serial, unitStatusForType(slip.type), si.to_loc || slip.case_no, slip.borrower, slip.date);
          unitId = info.lastInsertRowid;
          newUnits.push({ id: unitId, serial });
        } else {
          // 更新既有 unit 狀態/地點
          const newLoc = slip.type === 'transfer' ? (slip.to_case_no || si.to_loc) : (si.to_loc || slip.case_no);
          db.prepare(
            `UPDATE units SET status = ?, location = ?, custodian = ?, last_transfer_date = ?
             WHERE id = ?`
          ).run(unitStatusForType(slip.type), newLoc, slip.borrower, slip.date, unitId);
        }
      }

      // 耗材庫存加減（transfer 不改變總量）
      if (item.kind === 'consumable' && slip.type !== 'transfer') {
        const delta = stockDelta(slip.type, si.qty);
        const cond = si.condition_note?.includes('壞') || si.condition_note?.includes('修') ? 'repair' : 'good';
        // 確保 stock 列存在
        db.prepare('INSERT OR IGNORE INTO stock (item_id, condition, qty) VALUES (?, ?, 0)').run(si.item_id, cond);
        db.prepare('UPDATE stock SET qty = qty + ? WHERE item_id = ? AND condition = ?')
          .run(delta, si.item_id, cond);
      }

      // 寫異動紀錄（轉移產生兩筆：主紀錄 + from 方移交紀錄）
      const fromLoc = slip.type === 'transfer' ? (slip.case_no || si.from_loc) : (si.from_loc || null);
      const toLoc = slip.type === 'transfer' ? (slip.to_case_no || si.to_loc) : (si.to_loc || slip.case_no || null);
      const fromP = slip.type === 'transfer' ? (slip.from_person || null) : null;
      const toP = slip.type === 'transfer' ? (slip.borrower || null) : null;
      const mvQty = item.kind === 'consumable' ? (si.qty || 1) : 1;
      db.prepare(
        `INSERT INTO movements (slip_id, item_id, unit_id, type, date, qty, from_loc, to_loc, person, from_person, to_person, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(slipId, si.item_id, unitId ?? null, slip.type, slip.date, mvQty,
        fromLoc, toLoc, slip.borrower || null, fromP, toP,
        si.condition_note || slip.note || null);

      // 轉移額外寫一筆 from 方移交紀錄
      if (slip.type === 'transfer') {
        db.prepare(
          `INSERT INTO movements (slip_id, item_id, unit_id, type, date, qty, from_loc, to_loc, person, from_person, to_person, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(slipId, si.item_id, unitId ?? null, 'transfer_out', slip.date, mvQty,
          fromLoc, toLoc, slip.from_person || null,
          slip.from_person || null, slip.borrower || null,
          `移交→${toLoc || ''}`);
      }
    }

    db.prepare('UPDATE slips SET status = ? WHERE id = ?').run('confirmed', slipId);
    return { newUnits };
  });

  return tx();
}

function unitStatusForType(type) {
  switch (type) {
    case 'out': return 'out';
    case 'transfer': return 'out'; // 轉移後仍在工地，非在庫
    case 'in':
    case 'return': return 'in_stock';
    case 'scrap': return 'scrapped';
    case 'repair_out': return 'repair';
    case 'repair_back': return 'in_stock';
    default: return 'in_stock';
  }
}

function stockDelta(type, qty) {
  // 回倉/進倉/修回 → +；出倉/送修/報廢 → -
  switch (type) {
    case 'in':
    case 'return':
    case 'repair_back':
      return qty;
    case 'out':
    case 'repair_out':
    case 'scrap':
      return -qty;
    default:
      return 0;
  }
}
