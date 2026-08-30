import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();

  // ── a. 使用最多的器材列表（異動次數最多的設備，TOP 10） ──
  const topEquipment = db.prepare(
    `SELECT i.id, i.name, i.code, i.spec,
            COUNT(m.id) AS move_count,
            SUM(CASE WHEN m.type IN ('out','transfer') THEN 1 ELSE 0 END) AS out_count,
            SUM(CASE WHEN m.type IN ('in','return','repair_back') THEN 1 ELSE 0 END) AS in_count
     FROM items i
     LEFT JOIN movements m ON m.item_id = i.id
     WHERE i.kind = 'equipment'
     GROUP BY i.id
     HAVING move_count > 0
     ORDER BY move_count DESC
     LIMIT 10`
  ).all();

  // ── b. 耗材本週列表（本週有異動的耗材 + 目前庫存 + 本週進出量） ──
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStr = weekStart.toISOString().slice(0,10);

  const consumablesThisWeek = db.prepare(
    `SELECT i.id, i.name, i.spec, i.unit,
            COALESCE(s_good.qty, 0) AS current_qty,
            COALESCE(s_good.safety_qty, 0) AS safety_qty,
            COALESCE(wk.in_qty, 0) AS week_in,
            COALESCE(wk.out_qty, 0) AS week_out
     FROM items i
     LEFT JOIN stock s_good ON s_good.item_id = i.id AND s_good.condition = 'good'
     LEFT JOIN (
       SELECT m.item_id,
         SUM(CASE WHEN m.type IN ('in','return','repair_back') THEN m.qty ELSE 0 END) AS in_qty,
         SUM(CASE WHEN m.type IN ('out','repair_out','scrap') THEN m.qty ELSE 0 END) AS out_qty
       FROM movements m
       WHERE m.date >= ? AND m.item_id IN (SELECT id FROM items WHERE kind='consumable')
       GROUP BY m.item_id
     ) wk ON wk.item_id = i.id
     WHERE i.kind = 'consumable'
       AND (wk.in_qty > 0 OR wk.out_qty > 0 OR s_good.qty IS NOT NULL)
     ORDER BY (COALESCE(wk.in_qty,0) + COALESCE(wk.out_qty,0)) DESC, i.name`
  ).all(weekStr);

  // ── c. 整體器材使用概況 ──
  const totalEquipment = db.prepare(`SELECT COUNT(*) AS c FROM items WHERE kind='equipment'`).get().c;
  const totalConsumables = db.prepare(`SELECT COUNT(*) AS c FROM items WHERE kind='consumable'`).get().c;
  const totalUnits = db.prepare(`SELECT COUNT(*) AS c FROM units`).get().c;
  const inStock = db.prepare(`SELECT COUNT(*) AS c FROM units WHERE status='in_stock'`).get().c;
  const out = db.prepare(`SELECT COUNT(*) AS c FROM units WHERE status='out'`).get().c;
  const repair = db.prepare(`SELECT COUNT(*) AS c FROM units WHERE status='repair'`).get().c;
  const scrapped = db.prepare(`SELECT COUNT(*) AS c FROM units WHERE status='scrapped'`).get().c;
  const totalMovements = db.prepare(`SELECT COUNT(*) AS c FROM movements`).get().c;
  const totalSlips = db.prepare(`SELECT COUNT(*) AS c FROM slips`).get().c;
  const totalStockQty = db.prepare(`SELECT COALESCE(SUM(qty),0) AS s FROM stock WHERE condition='good'`).get().s;
  const lowStockCount = db.prepare(`SELECT COUNT(*) AS c FROM stock WHERE condition='good' AND safety_qty > 0 AND qty <= safety_qty`).get().c;

  // 在外超過30天
  const outOver30 = db.prepare(
    `SELECT COUNT(*) AS c FROM units WHERE status='out'
     AND last_transfer_date IS NOT NULL
     AND julianday('now') - julianday(last_transfer_date) > 30`
  ).get().c;

  // 最近5筆異動
  const recent = db.prepare(
    `SELECT m.id, m.date, m.type, m.person, m.from_person, m.to_loc, m.from_loc,
            i.name, m.unit_id, u.serial, s.no AS slip_no
     FROM movements m JOIN items i ON m.item_id=i.id
     LEFT JOIN units u ON m.unit_id=u.id LEFT JOIN slips s ON m.slip_id=s.id
     WHERE m.type NOT IN ('transfer_out')
     ORDER BY m.id DESC LIMIT 10`
  ).all();

  const summary = `設備 ${totalUnits} 台（在庫 ${inStock}／在外 ${out}／待修 ${repair}／報廢 ${scrapped}）；耗材 ${totalConsumables} 種、庫存 ${totalStockQty}；本週耗材異動 ${consumablesThisWeek.filter(c=>c.week_in+c.week_out>0).length} 種；低庫存 ${lowStockCount}；在外超30天 ${outOver30}`;

  res.json({
    summary,
    // a. 使用最多器材
    top_equipment: topEquipment,
    // b. 耗材本週
    consumables_this_week: consumablesThisWeek,
    week_start: weekStr,
    // c. 整體概況
    overview: {
      total_equipment: totalEquipment, total_consumables: totalConsumables, total_units: totalUnits,
      in_stock: inStock, out, repair, scrapped,
      out_over_30: outOver30,
      low_stock: lowStockCount,
      total_movements: totalMovements,
      total_slips: totalSlips,
      total_stock_qty: totalStockQty,
    },
    recent,
  });
});

export default router;
