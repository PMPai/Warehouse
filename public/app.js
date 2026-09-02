'use strict';
const $main = document.getElementById('main');
const $nav = document.querySelector('.sidebar');
const $toast = document.getElementById('toast-container');
let view = 'dashboard';
let state = {};

// ── utils ──
async function api(path, opts) {
  const r = await fetch('/api/' + path, opts);
  if (r.status === 401) {
    window.location.href = '/login.html';
    throw new Error('unauthorized');
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error || 'API error');
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) return r.json();
  return r;
}
async function logout() {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login.html';
}
function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $toast.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 3000);
}
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function badge(status) {
  const labels = {in_stock:'在庫',out:'在外',repair:'待修',scrapped:'報廢',lost:'不見',out_pending_cleanup:'待清理',confirmed:'已確認',draft:'草稿'};
  return `<span class="badge ${status}">${labels[status]||status}</span>`;
}
function typeBadge(type) {
  const labels = {out:'出倉',in:'進倉',return:'回倉',transfer:'轉移',scrap:'報廢',repair_out:'送修',repair_back:'修回'};
  return `<span class="badge type-${type}">${labels[type]||type}</span>`;
}
function skel(n=3) {
  return Array(n).fill('<div class="skel" style="height:20px;margin-bottom:8px"></div>').join('');
}
function empty(msg='尚無資料') {
  return `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg><p>${msg}</p></div>`;
}
function todayStr() { return new Date().toISOString().slice(0,10); }

// ── generic delete confirmation ──
async function delRecord(apiPath, label) {
  if (!confirm(`確定刪除「${label}」？\n此操作會記錄在 audit_log。`)) return;
  try {
    await api(apiPath, { method: 'DELETE' });
    toast(`已刪除：${label}`, 'success');
    render();
  } catch (e) { toast(e.message, 'error'); }
}

// ── nav ──
$nav.addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  view = a.dataset.view;
  $nav.querySelectorAll('a').forEach(x => x.classList.toggle('active', x === a));
  render();
});

document.getElementById('logout-btn')?.addEventListener('click', logout);

async function render() {
  $main.innerHTML = '<p class="muted">載入中...</p>';
  try {
    const fn = views[view];
    if (fn) await fn();
    else $main.innerHTML = `<h1>404</h1>`;
  } catch (e) {
    $main.innerHTML = `<div class="card"><p style="color:var(--c-danger);font-size:16px">⚠ ${e.message}</p></div>`;
  }
}

// ── dashboard ──
async function viewDashboard() {
  const d = await api('dashboard');
  const o = d.overview;
  let html = `<h1>設備管理系統</h1>`;

  // c. 整體器材使用概況（概覽卡片）
  html += `<div class="stat-row">`;
  html += `<div class="dash-stat ok"><div class="lbl">設備總數</div><div class="num mono">${o.total_units}</div><div class="unit">台</div></div>`;
  html += `<div class="dash-stat blue"><div class="lbl">在庫</div><div class="num mono">${o.in_stock}</div><div class="unit">台</div></div>`;
  html += `<div class="dash-stat"><div class="lbl">在外</div><div class="num mono">${o.out}</div><div class="unit">台</div></div>`;
  html += `<div class="dash-stat warn"><div class="lbl">待修</div><div class="num mono">${o.repair}</div><div class="unit">台</div></div>`;
  html += `<div class="dash-stat ${o.out_over_30?'danger':''}"><div class="lbl">超30天</div><div class="num mono">${o.out_over_30}</div><div class="unit">台</div></div>`;
  html += `<div class="dash-stat ${o.low_stock?'danger':''}"><div class="lbl">低庫存</div><div class="num mono">${o.low_stock}</div><div class="unit">項</div></div>`;
  html += `</div>`;

  // a. 使用最多的器材列表
  html += `<div class="card"><h2>使用最多的器材 TOP ${d.top_equipment.length}</h2>`;
  if (d.top_equipment.length) {
    html += `<table><thead><tr><th>品名</th><th>規格</th><th>代碼</th><th>異動次數</th><th>出</th><th>入</th></tr></thead><tbody>`;
    html += d.top_equipment.map(e => `<tr class="clickable" onclick="goHistory2('${e.id}')"><td><strong>${e.name}</strong></td><td>${e.spec||'-'}</td><td class="mono faint">${e.code||''}</td><td class="mono"><strong>${e.move_count}</strong></td><td class="mono">${e.out_count||0}</td><td class="mono">${e.in_count||0}</td></tr>`).join('');
    html += `</tbody></table>`;
  } else html += empty('尚無使用紀錄');
  html += `</div>`;

  // b. 耗材本週列表
  html += `<div class="card"><h2>耗材本週列表（自 ${d.week_start}）</h2>`;
  if (d.consumables_this_week.length) {
    html += `<table><thead><tr><th>品名</th><th>規格</th><th>目前庫存</th><th>安全</th><th>本週進</th><th>本週出</th><th>單位</th></tr></thead><tbody>`;
    html += d.consumables_this_week.map(c => {
      const low = c.current_qty <= c.safety_qty && c.safety_qty > 0;
      return `<tr class="clickable" onclick="openStockAdjust(${c.id})"><td><strong>${c.name}</strong></td><td>${c.spec||'-'}</td><td class="mono" style="color:${low?'var(--c-danger)':'var(--c-text)'}">${c.current_qty}</td><td class="mono faint">${c.safety_qty||0}</td><td class="mono" style="color:var(--c-success)">${c.week_in>0?'+'+c.week_in:'-'}</td><td class="mono" style="color:var(--c-danger)">${c.week_out>0?'-'+c.week_out:'-'}</td><td>${c.unit||'-'}</td></tr>`;
    }).join('');
    html += `</tbody></table>`;
  } else html += empty('本週無耗材異動');
  html += `</div>`;

  // 最近異動（簡短）
  if (d.recent.length) {
    html += `<div class="card"><h2>最近異動</h2><table><thead><tr><th>日期</th><th>類型</th><th>品名</th><th>編號</th><th>from→to</th><th>經手人</th></tr></thead><tbody>`;
    html += d.recent.map(m => `<tr class="clickable" onclick="goSlip(${m.slip_id})"><td>${m.date}</td><td>${typeBadge(m.type)}</td><td>${m.name}</td><td class="mono">${m.serial?'#'+m.serial:''}</td><td class="faint">${m.from_loc||'-'}→${m.to_loc||'-'}</td><td>${m.person||'-'}${m.from_person?' / '+m.from_person:''}</td></tr>`).join('');
    html += `</tbody></table></div>`;
  }
  $main.innerHTML = html;
}

// ── quick entry (快速開單) ──
async function viewNewSlip() {
  let html = `<h1>快速開單</h1>`;
  html += `<div class="card">
    <div class="form-row">
      <div class="field" style="min-width:120px"><label>類型</label>
        <select class="select" id="f-type" onchange="onTypeChange()">
          <option value="out">出倉</option><option value="in">進倉</option><option value="return">回倉</option>
          <option value="transfer">轉移</option><option value="scrap">報廢</option>
          <option value="repair_out">送修</option><option value="repair_back">修回</option>
        </select></div>
      <div class="field"><label>日期</label><input class="input" type="date" id="f-date" value="${todayStr()}"></div>
      <div class="field" id="f-case-wrap"><label id="f-case-label">案號</label><input class="input" id="f-case" placeholder="如 26-023" list="case-list"></div>
      <div class="field" id="f-tocase-wrap" style="display:none"><label>目的地案號</label><input class="input" id="f-tocase" placeholder="如 24-014" list="case-list"></div>
      <div class="field"><label id="f-borrower-label">借用人</label><input class="input" id="f-borrower" placeholder="簽名人"></div>
      <div class="field" id="f-fromperson-wrap" style="display:none"><label>移交人（A 案場負責人）</label><input class="input" id="f-fromperson" placeholder="A 案場經手人"></div>
    </div>
    <div class="field"><label>備註</label><input class="input" id="f-note" placeholder="選填"></div>
  </div>`;

  html += `<div class="card">
    <div class="section-title">明細</div>
    <div id="item-rows"></div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-secondary btn-sm" onclick="addItemRow()">＋ 新增明細</button>
    </div>
  </div>`;

  html += `<div style="display:flex;gap:12px">
    <button class="btn btn-primary" onclick="submitSlip(true)">確認入帳</button>
    <button class="btn btn-secondary" onclick="submitSlip(false)">存草稿</button>
  </div>`;
  $main.innerHTML = html;

  try {
    const cs = await api('cases');
    document.getElementById('case-list').innerHTML = cs.rows.map(c => `<option value="${c.case_no}">${c.name||''}</option>`).join('');
  } catch {}

  addItemRow();
}

function onTypeChange() {
  const type = document.getElementById('f-type').value;
  const isTransfer = type === 'transfer';
  document.getElementById('f-tocase-wrap').style.display = isTransfer ? '' : 'none';
  document.getElementById('f-fromperson-wrap').style.display = isTransfer ? '' : 'none';
  document.getElementById('f-case-label').textContent = isTransfer ? '來源案號（A 案場）' : '案號';
  document.getElementById('f-borrower-label').textContent = isTransfer ? '接收人（B 案場負責人）' : '借用人';
}

async function goHistory2(itemId) {
  const d = await api(`units?item=${itemId}`);
  if (d.rows.length) goHistory(d.rows[0].id);
  else toast('此器材尚無設備個體', 'error');
}

function addItemRow() {
  const container = document.getElementById('item-rows');
  const row = el('div', 'item-row');
  row.innerHTML = `
    <input class="input ir-name" placeholder="品名（輸入搜尋）" oninput="acSearch(this)">
    <input class="input ir-qty" type="number" value="1" min="1" style="width:70px" title="數量">
    <input class="input" placeholder="編號（設備填，無則留空）" style="width:100px" title="編號">
    <input class="input" placeholder="狀況備註" style="width:120px">
    <button class="btn btn-ghost btn-sm" onclick="this.closest('.item-row').remove()">✕</button>
  `;
  container.appendChild(row);
}

let acTimer;
function acSearch(input) {
  clearTimeout(acTimer);
  const q = input.value.trim();
  const wrap = input.parentElement;
  let dl = wrap.querySelector('.ac-list');
  if (!q) { if (dl) dl.remove(); return; }
  acTimer = setTimeout(async () => {
    try {
      const d = await api(`items?q=${encodeURIComponent(q)}`);
      if (dl) dl.remove();
      if (!d.rows.length) return;
      dl = el('div', 'ac-list');
      d.rows.forEach(r => {
        const item = el('div', 'ac-item');
        item.innerHTML = `<span class="ac-name">${r.name}</span> <span class="ac-meta">${r.spec||''} ${r.aliases?'· '+r.aliases:''}</span>`;
        item.onclick = () => {
          input.value = r.name;
          input.dataset.itemId = r.id;
          input.dataset.kind = r.kind;
          dl.remove();
        };
        dl.appendChild(item);
      });
      wrap.appendChild(dl);
    } catch {}
  }, 300);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.ac-wrap') && !e.target.closest('.ac-list')) {
    document.querySelectorAll('.ac-list').forEach(d => d.remove());
  }
});

async function submitSlip(confirm) {
  const type = document.getElementById('f-type').value;
  const date = document.getElementById('f-date').value;
  const caseNo = document.getElementById('f-case').value;
  const toCaseNo = document.getElementById('f-tocase')?.value;
  const fromPerson = document.getElementById('f-fromperson')?.value;
  const borrower = document.getElementById('f-borrower').value;
  const note = document.getElementById('f-note').value;
  if (!date) return toast('請填日期', 'error');
  if (type === 'transfer') {
    if (!caseNo) return toast('請填來源案號', 'error');
    if (!toCaseNo) return toast('請填目的地案號', 'error');
    if (!fromPerson) return toast('請填移交人（A 案場負責人）', 'error');
    if (!borrower) return toast('請填接收人（B 案場負責人）', 'error');
  }
  const rows = document.querySelectorAll('#item-rows .item-row');
  const items = [];
  for (const r of rows) {
    const nameInput = r.querySelector('.ir-name');
    const itemId = nameInput.dataset.itemId;
    if (!itemId) return toast(`品名「${nameInput.value}」未匹配，請從清單選擇`, 'error');
    const qty = parseInt(r.children[1].value) || 1;
    const serial = r.children[2].value.trim();
    const cond = r.children[3].value.trim();
    const kind = nameInput.dataset.kind;
    items.push({ item_id: Number(itemId), qty, condition_note: cond||null, new_serial: kind==='equipment' && !serial ? true : false });
  }
  if (!items.length) return toast('請至少新增一筆明細', 'error');
  try {
    const body = { type, date, case_no: caseNo||null, to_case_no: toCaseNo||null, from_person: fromPerson||null, borrower: borrower||null, note, source:'manual', status: confirm?'confirmed':'draft', items };
    const r = await api('slips', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast(`已${confirm?'入帳':'存草稿'}：${r.no}`, 'success');
    view = 'slips'; render();
  } catch (e) { toast(e.message, 'error'); }
}

// ── slips list ──
async function viewSlips() {
  const d = await api('slips');
  let html = `<h1>進出單 (${d.count})</h1>`;
  html += `<div class="card"><div class="filter-bar">
    <div class="field"><label>案號</label><input class="input" id="sf-case" placeholder="26-023" style="width:100px"></div>
    <div class="field"><label>類型</label><select class="select" id="sf-type" style="width:90px"><option value="">全部</option><option value="out">出倉</option><option value="in">進倉</option><option value="return">回倉</option><option value="transfer">轉移</option><option value="scrap">報廢</option><option value="repair_out">送修</option><option value="repair_back">修回</option></select></div>
    <div class="field"><label>從</label><input class="input" type="date" id="sf-from" style="width:130px"></div>
    <div class="field"><label>到</label><input class="input" type="date" id="sf-to" style="width:130px"></div>
    <button class="btn btn-primary btn-sm" onclick="searchSlips()">搜尋</button>
  </div></div>`;
  html += `<div class="card" id="slip-table">${slipTable(d.rows)}</div>`;
  $main.innerHTML = html;
  document.getElementById('sf-case').addEventListener('keydown', e => { if(e.key==='Enter') searchSlips(); });
}

function slipTable(rows) {
  if (!rows.length) return empty('無進出單');
  return `<table><thead><tr><th>單號</th><th>日期</th><th>類型</th><th>案號</th><th>借用人</th><th>明細</th><th>狀態</th><th>操作</th></tr></thead><tbody>
    ${rows.map(s => `<tr><td class="mono clickable" onclick="goSlip(${s.id})">${s.no}</td><td>${s.date}</td><td>${typeBadge(s.type)}</td><td>${s.case_no||'-'}</td><td>${s.borrower||'-'}</td><td class="mono">${s.item_count}</td><td>${badge(s.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="editSlip(${s.id})" title="編輯">✎</button> <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="delRecord('slips/${s.id}','${s.no}')" title="刪除">✕</button></td></tr>`).join('')}
  </tbody></table>`;
}

async function searchSlips() {
  const params = new URLSearchParams();
  const c = document.getElementById('sf-case').value;
  const t = document.getElementById('sf-type').value;
  const f = document.getElementById('sf-from').value;
  const to = document.getElementById('sf-to').value;
  if (c) params.set('case', c);
  if (t) params.set('type', t);
  if (f) params.set('from', f);
  if (to) params.set('to', to);
  const d = await api(`slips?${params}`);
  document.getElementById('slip-table').innerHTML = slipTable(d.rows);
}

// ── slip detail ──
async function goSlip(id) {
  view = '_slip'; $nav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
  const d = await api(`slips/${id}`);
  let html = `<h1>${d.slip.no} ${typeBadge(d.slip.type)} ${badge(d.slip.status)}</h1>`;
  html += `<div class="card"><div class="form-row">
    <div class="field"><label>日期</label><p>${d.slip.date}</p></div>
    <div class="field"><label>案號</label><p>${d.slip.case_no||'-'}</p></div>
    <div class="field"><label>借用人</label><p>${d.slip.borrower||'-'}</p></div>
    <div class="field"><label>來源</label><p>${d.slip.source}</p></div>
  </div>`;
  if (d.slip.note) html += `<p class="muted">備註：${d.slip.note}</p>`;
  html += `</div>`;
  html += `<div class="card"><h2>明細</h2><table><thead><tr><th>品名</th><th>規格</th><th>編號</th><th>數量</th><th>來源</th><th>目的地</th><th>狀況</th></tr></thead><tbody>`;
  html += d.items.map(i => `<tr><td>${i.name}</td><td>${i.spec||'-'}</td><td class="mono">${i.serial?'#'+i.serial:''}</td><td class="mono">${i.qty}</td><td>${i.from_loc||'-'}</td><td>${i.to_loc||'-'}</td><td>${i.condition_note||'-'}</td></tr>`).join('');
  html += `</tbody></table></div>`;
  if (d.photos.length) {
    html += `<div class="card"><h2>照片</h2><div style="display:flex;gap:12px;flex-wrap:wrap">`;
    html += d.photos.map(p => `<img src="/photos/${p.filename}" style="max-height:200px;border-radius:6px;cursor:pointer" onclick="window.open('/photos/${p.filename}','_blank')">`).join('');
    html += `</div></div>`;
  }
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn btn-secondary" onclick="view='slips';document.querySelector('[data-view=slips]').classList.add('active');render()">← 返回列表</button>
    <button class="btn btn-primary" onclick="editSlip(${id})">編輯</button>`;
  if (d.slip.status === 'draft') {
    html += ` <button class="btn btn-primary" onclick="confirmSlip(${id})">確認入帳</button>`;
  }
  html += ` <button class="btn btn-danger" onclick="delRecord('slips/${id}','${d.slip.no}')">刪除</button>`;
  html += `</div>`;
  $main.innerHTML = html;
}

async function confirmSlip(id) {
  try {
    const r = await api(`slips/${id}/confirm`, { method:'POST' });
    toast(`已入帳：${r.id}`, 'success');
    goSlip(id);
  } catch (e) { toast(e.message, 'error'); }
}

async function editSlip(id) {
  const d = await api(`slips/${id}`);
  const s = d.slip;
  const typeOpts = ['out','in','return','transfer','scrap','repair_out','repair_back'];
  const typeLabels = {out:'出倉',in:'進倉',return:'回倉',transfer:'轉移',scrap:'報廢',repair_out:'送修',repair_back:'修回'};
  let html = `<h1>編輯進出單 ${s.no}</h1>`;
  html += `<div class="card" style="max-width:600px">
    <div class="form-row">
      <div class="field"><label>類型</label><select class="select" id="es-type">${typeOpts.map(t=>`<option value="${t}" ${t===s.type?'selected':''}>${typeLabels[t]}</option>`).join('')}</select></div>
      <div class="field"><label>日期</label><input class="input" type="date" id="es-date" value="${s.date}"></div>
      <div class="field"><label>案號</label><input class="input" id="es-case" value="${s.case_no||''}"></div>
      <div class="field"><label>目的地案號（轉移）</label><input class="input" id="es-tocase" value="${s.to_case_no||''}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>借用人/接收人</label><input class="input" id="es-borrower" value="${s.borrower||''}"></div>
      <div class="field"><label>移交人（轉移）</label><input class="input" id="es-fromperson" value="${s.from_person||''}"></div>
    </div>
    <div class="field"><label>備註</label><input class="input" id="es-note" value="${s.note||''}"></div>`;
  if (d.items.length) {
    html += `<h2 style="margin-top:16px">明細（${d.items.length} 筆）</h2><table><thead><tr><th>品名</th><th>編號</th><th>數量</th><th>狀況</th><th>刪除</th></tr></thead><tbody>`;
    html += d.items.map(i => `<tr><td>${i.name}</td><td class="mono">${i.serial?'#'+i.serial:''}</td><td class="mono">${i.qty}</td><td>${i.condition_note||'-'}</td><td><button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="delSlipItem(${s.id},${i.id},'${i.name}')">✕</button></td></tr>`).join('');
    html += `</tbody></table>`;
  }
  html += `<div style="display:flex;gap:8px;margin-top:16px">
    <button class="btn btn-primary" onclick="saveSlip(${s.id})">儲存修改</button>
    <button class="btn btn-danger" onclick="delRecord('slips/${s.id}','${s.no}')">刪除整張單</button>
    <button class="btn btn-secondary" onclick="view='slips';document.querySelector('[data-view=slips]').classList.add('active');render()">取消</button>
  </div></div>`;
  $main.innerHTML = html;
}

async function saveSlip(id) {
  const body = {
    type: document.getElementById('es-type').value,
    date: document.getElementById('es-date').value,
    case_no: document.getElementById('es-case').value || null,
    to_case_no: document.getElementById('es-tocase').value || null,
    borrower: document.getElementById('es-borrower').value || null,
    from_person: document.getElementById('es-fromperson').value || null,
    note: document.getElementById('es-note').value || null,
  };
  try {
    await api(`slips/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('已儲存修改', 'success');
    view = 'slips'; render();
  } catch (e) { toast(e.message, 'error'); }
}

async function delSlipItem(slipId, itemId, name) {
  if (!confirm(`確定刪明明細「${name}」？`)) return;
  try {
    await api(`slips/${slipId}/items/${itemId}`, { method:'DELETE' });
    toast(`已刪除：${name}`, 'success');
    editSlip(slipId);
  } catch (e) { toast(e.message, 'error'); }
}

// ── units ──
async function viewUnits() {
  const d = await api('units');
  let html = `<h1>設備 (${d.count})</h1>`;
  html += `<div class="card"><div class="filter-bar">
    <div class="field"><label>狀態</label><select class="select" id="uf-status" style="width:100px" onchange="searchUnits()"><option value="">全部</option><option value="in_stock">在庫</option><option value="out">在外</option><option value="repair">待修</option><option value="scrapped">報廢</option><option value="lost">不見</option><option value="out_pending_cleanup">待清理</option></select></div>
    <div class="field"><label>地點</label><input class="input" id="uf-loc" placeholder="案號/倉庫" style="width:120px"></div>
    <button class="btn btn-primary btn-sm" onclick="searchUnits()">搜尋</button>
  </div></div>`;
  html += `<div class="card" id="unit-table">${unitTable(d.rows)}</div>`;
  $main.innerHTML = html;
}

function unitTable(rows) {
  if (!rows.length) return empty('無設備');
  return `<table><thead><tr><th>品名</th><th>編號</th><th>狀態</th><th>地點</th><th>保管人</th><th>轉出日</th><th>操作</th></tr></thead><tbody>
    ${rows.map(u => `<tr><td class="clickable" onclick="goHistory(${u.id})">${u.name}</td><td class="mono clickable" onclick="goHistory(${u.id})">#${u.serial||''}</td><td>${badge(u.status)}</td><td>${u.location||'-'}</td><td>${u.custodian||'-'}</td><td>${u.last_transfer_date||'-'}</td><td><button class="btn btn-ghost btn-sm" onclick="editUnit(${u.id})" title="編輯">✎</button> <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="delRecord('units/${u.id}','${u.name} #${u.serial||''}')" title="刪除">✕</button></td></tr>`).join('')}
  </tbody></table>`;
}

async function searchUnits() {
  const params = new URLSearchParams();
  const s = document.getElementById('uf-status').value;
  const l = document.getElementById('uf-loc').value;
  if (s) params.set('status', s);
  if (l) params.set('location', l);
  const d = await api(`units?${params}`);
  document.getElementById('unit-table').innerHTML = unitTable(d.rows);
}

async function goHistory(id) {
  view = '_history'; $nav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
  const d = await api(`units/${id}/history`);
  const u = d.unit;
  let html = `<h1>${u.name} #${u.serial||''} ${badge(u.status)}</h1>`;
  html += `<div class="card"><div class="form-row">
    <div class="field"><label>代碼</label><p>${u.code||'-'}</p></div>
    <div class="field"><label>規格</label><p>${u.spec||'-'}</p></div>
    <div class="field"><label>目前地點</label><p>${u.location||'-'}</p></div>
    <div class="field"><label>保管人</label><p>${u.custodian||'-'}</p></div>
    <div class="field"><label>轉出日</label><p>${u.last_transfer_date||'-'}</p></div>
  </div></div>`;
  html += `<div class="card"><h2>異動歷史 (${d.count})</h2>`;
  if (d.rows.length) {
    html += `<table><thead><tr><th>日期</th><th>類型</th><th>來源</th><th>目的地</th><th>經手人</th><th>單號</th><th>備註</th></tr></thead><tbody>`;
    html += d.rows.map(m => `<tr><td>${m.date}</td><td>${typeBadge(m.type)}</td><td>${m.from_loc||'-'}</td><td>${m.to_loc||'-'}</td><td>${m.person||'-'}</td><td class="mono">${m.slip_no||''}</td><td>${m.note||'-'}</td></tr>`).join('');
    html += `</tbody></table>`;
  } else html += empty('無異動紀錄');
  html += `</div>`;
  html += `<div style="display:flex;gap:8px"><button class="btn btn-secondary" onclick="view='units';document.querySelector('[data-view=units]').classList.add('active');render()">← 返回列表</button> <button class="btn btn-primary" onclick="editUnit(${u.id})">編輯設備</button></div>`;
  $main.innerHTML = html;
}

async function editUnit(id) {
  const d = await api(`units/${id}/history`);
  const u = d.unit;
  const statuses = ['in_stock','out','repair','scrapped','lost','out_pending_cleanup'];
  const statusLabels = {in_stock:'在庫',out:'在外',repair:'待修',scrapped:'報廢',lost:'不見',out_pending_cleanup:'待清理'};
  let html = `<h1>編輯設備 ${u.name} #${u.serial||''}</h1>`;
  html += `<div class="card" style="max-width:600px">
    <div class="form-row">
      <div class="field"><label>編號</label><input class="input" id="eu-serial" value="${u.serial||''}"></div>
      <div class="field"><label>狀態</label><select class="select" id="eu-status">${statuses.map(s=>`<option value="${s}" ${s===u.status?'selected':''}>${statusLabels[s]}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="field"><label>地點</label><input class="input" id="eu-location" value="${u.location||''}"></div>
      <div class="field"><label>保管人</label><input class="input" id="eu-custodian" value="${u.custodian||''}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>轉出日</label><input class="input" type="date" id="eu-transfer" value="${u.last_transfer_date||''}"></div>
      <div class="field"><label>購買日</label><input class="input" type="date" id="eu-purchase" value="${u.purchase_date||''}"></div>
      <div class="field"><label>財編</label><input class="input" id="eu-property" value="${u.property_no||''}"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" onclick="saveUnit(${u.id})">儲存</button>
      <button class="btn btn-danger" onclick="delRecord('units/${u.id}','${u.name} #${u.serial||''}')">刪除</button>
      <button class="btn btn-secondary" onclick="view='units';document.querySelector('[data-view=units]').classList.add('active');render()">取消</button>
    </div>
  </div>`;
  $main.innerHTML = html;
}

async function saveUnit(id) {
  const body = {
    serial: document.getElementById('eu-serial').value || null,
    status: document.getElementById('eu-status').value,
    location: document.getElementById('eu-location').value || null,
    custodian: document.getElementById('eu-custodian').value || null,
    last_transfer_date: document.getElementById('eu-transfer').value || null,
    purchase_date: document.getElementById('eu-purchase').value || null,
    property_no: document.getElementById('eu-property').value || null,
  };
  try {
    await api(`units/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('已儲存', 'success');
    view = 'units'; render();
  } catch (e) { toast(e.message, 'error'); }
}

// ── stock ──
async function viewStock() {
  const d = await api('stock');
  let html = `<h1>耗材庫存 (${d.count})</h1>`;
  html += `<div class="card"><div class="filter-bar">
    <label class="muted" style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="sf-low" onchange="searchStock()"> 只看低庫存</label>
  </div></div>`;
  html += `<div class="card" id="stock-table">${stockTable(d.rows)}</div>`;
  $main.innerHTML = html;
}

function stockTable(rows) {
  if (!rows.length) return empty('無庫存');
  return `<table><thead><tr><th>品名</th><th>規格</th><th>狀態</th><th>數量</th><th>安全庫存</th><th>單位</th><th>操作</th></tr></thead><tbody>
    ${rows.map(s => `<tr><td>${s.name}</td><td>${s.spec||'-'}</td><td><span class="badge ${s.condition==='good'?'in_stock':s.condition==='repair'?'repair':'scrapped'}">${s.condition}</span></td><td class="mono" style="color:${s.qty<=s.safety_qty?'var(--c-danger)':''}">${s.qty}</td><td class="mono">${s.safety_qty||0}</td><td>${s.unit||'-'}</td><td><button class="btn btn-ghost btn-sm" onclick="openStockAdjust(${s.item_id})" title="調整">±</button> <button class="btn btn-ghost btn-sm" onclick="editStock(${s.item_id},'${s.condition}')" title="編輯">✎</button> <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="delRecord('stock/${s.item_id}?condition=${s.condition}','${s.name} ${s.condition}')" title="刪除">✕</button></td></tr>`).join('')}
  </tbody></table>`;
}

async function editStock(itemId, condition) {
  const d = await api(`stock?item=${itemId}`);
  const s = d.rows.find(r => r.condition === condition);
  if (!s) return toast('找不到庫存', 'error');
  let html = `<h1>編輯庫存 — ${s.name}</h1>`;
  html += `<div class="card" style="max-width:500px">
    <div class="form-row">
      <div class="field"><label>數量</label><input class="input" type="number" id="est-qty" value="${s.qty}"></div>
      <div class="field"><label>安全庫存</label><input class="input" type="number" id="est-safety" value="${s.safety_qty||0}"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" onclick="saveStock(${s.item_id},'${condition}')">儲存</button>
      <button class="btn btn-danger" onclick="delRecord('stock/${s.item_id}?condition=${condition}','${s.name} ${condition}')">刪除</button>
      <button class="btn btn-secondary" onclick="view='stock';document.querySelector('[data-view=stock]').classList.add('active');render()">取消</button>
    </div>
  </div>`;
  $main.innerHTML = html;
}

async function saveStock(itemId, condition) {
  const body = {
    qty: parseInt(document.getElementById('est-qty').value),
    safety_qty: parseInt(document.getElementById('est-safety').value),
  };
  try {
    await api(`stock/${itemId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...body, condition }) });
    toast('已儲存', 'success');
    view = 'stock'; render();
  } catch (e) { toast(e.message, 'error'); }
}

async function searchStock() {
  const low = document.getElementById('sf-low').checked ? '1' : '';
  const d = await api(`stock?${low?'low=1':''}`);
  document.getElementById('stock-table').innerHTML = stockTable(d.rows);
}

// ── movements ──
async function viewMovements() {
  const d = await api('movements');
  let html = `<h1>異動紀錄 (${d.count})</h1>`;
  html += `<div class="card"><div class="filter-bar">
    <div class="field"><label>案號</label><input class="input" id="mf-case" placeholder="26-023" style="width:100px"></div>
    <div class="field"><label>類型</label><select class="select" id="mf-type" style="width:90px"><option value="">全部</option><option value="out">出倉</option><option value="in">進倉</option><option value="return">回倉</option><option value="transfer">轉移</option><option value="scrap">報廢</option><option value="repair_out">送修</option><option value="repair_back">修回</option></select></div>
    <div class="field"><label>從</label><input class="input" type="date" id="mf-from" style="width:130px"></div>
    <div class="field"><label>到</label><input class="input" type="date" id="mf-to" style="width:130px"></div>
    <button class="btn btn-primary btn-sm" onclick="searchMovements()">搜尋</button>
    <button class="btn btn-secondary btn-sm" onclick="exportMovements()">匯出CSV</button>
  </div></div>`;
  html += `<div class="card" id="mv-table">${mvTable(d.rows)}</div>`;
  $main.innerHTML = html;
}

function mvTable(rows) {
  if (!rows.length) return empty('無異動紀錄');
  const body = rows.slice(0,100).map(m => {
    const slipMark = m.slip_id ? ` <span class="faint" title="來自進出單 ${m.slip_no||''}">(${m.slip_no||'單'})</span>` : '';
    return `<tr><td>${m.date}</td><td>${typeBadge(m.type)}</td><td>${m.name}</td><td class="mono">${m.serial?'#'+m.serial:''}</td><td>${m.from_loc||'-'}</td><td>${m.to_loc||'-'}</td><td>${m.person||'-'}${m.from_person?' / '+m.from_person:''}</td><td class="mono">${slipMark}</td><td><button class="btn btn-ghost btn-sm" onclick="editMv(${m.id})" title="編輯">✎</button> <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="delMv(${m.id})" title="刪除">✕</button></td></tr>`;
  }).join('');
  return `<table><thead><tr><th>日期</th><th>類型</th><th>品名</th><th>編號</th><th>來源</th><th>目的地</th><th>經手人</th><th>單號</th><th>操作</th></tr></thead><tbody>${body}</tbody></table>${rows.length>100?'<p class="muted">僅顯示前 100 筆</p>':''}`;
}

async function delMv(id) {
  await delRecord(`movements/${id}`, `異動#${id}`);
}

async function editMv(id) {
  const all = await api('movements');
  const m = all.rows.find(r => r.id === id);
  if (!m) return toast('找不到紀錄', 'error');
  const typeOpts = ['out','in','return','transfer','transfer_out','scrap','repair_out','repair_back'];
  const typeLabels = {out:'出倉',in:'進倉',return:'回倉',transfer:'轉移',transfer_out:'轉移(移交)',scrap:'報廢',repair_out:'送修',repair_back:'修回'};
  let html = `<h1>編輯異動紀錄 #${id}</h1>`;
  html += `<div class="card" style="max-width:600px">
    <div class="form-row">
      <div class="field"><label>日期</label><input class="input" type="date" id="em-date" value="${m.date}"></div>
      <div class="field"><label>類型</label><select class="select" id="em-type">${typeOpts.map(t=>`<option value="${t}" ${t===m.type?'selected':''}>${typeLabels[t]||t}</option>`).join('')}</select></div>
      <div class="field"><label>數量</label><input class="input" type="number" id="em-qty" value="${m.qty||1}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>來源</label><input class="input" id="em-from" value="${m.from_loc||''}"></div>
      <div class="field"><label>目的地</label><input class="input" id="em-to" value="${m.to_loc||''}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>經手人</label><input class="input" id="em-person" value="${m.person||''}"></div>
      <div class="field"><label>移交人</label><input class="input" id="em-fromp" value="${m.from_person||''}"></div>
      <div class="field"><label>接收人</label><input class="input" id="em-top" value="${m.to_person||''}"></div>
    </div>
    <div class="field"><label>備註</label><input class="input" id="em-note" value="${m.note||''}"></div>`;
  if (m.slip_id) {
    html += `<p class="muted" style="margin-top:8px">⚠ 此紀錄來自進出單 ${m.slip_no||''}，修改後可能與原單不一致。</p>`;
  }
  html += `<div style="display:flex;gap:8px;margin-top:16px">
    <button class="btn btn-primary" onclick="saveMv(${id})">儲存</button>
    <button class="btn btn-danger" onclick="delMv(${id})">刪除</button>
    <button class="btn btn-secondary" onclick="view='movements';document.querySelector('[data-view=movements]').classList.add('active');render()">取消</button>
  </div></div>`;
  $main.innerHTML = html;
}

async function saveMv(id) {
  const body = {
    date: document.getElementById('em-date').value,
    type: document.getElementById('em-type').value,
    qty: parseInt(document.getElementById('em-qty').value) || 1,
    from_loc: document.getElementById('em-from').value || null,
    to_loc: document.getElementById('em-to').value || null,
    person: document.getElementById('em-person').value || null,
    from_person: document.getElementById('em-fromp').value || null,
    to_person: document.getElementById('em-top').value || null,
    note: document.getElementById('em-note').value || null,
  };
  try {
    await api(`movements/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('已儲存', 'success');
    view = 'movements'; render();
  } catch (e) { toast(e.message, 'error'); }
}

async function searchMovements() {
  const params = new URLSearchParams();
  const c = document.getElementById('mf-case').value;
  const t = document.getElementById('mf-type').value;
  const f = document.getElementById('mf-from').value;
  const to = document.getElementById('mf-to').value;
  if (c) params.set('case', c);
  if (t) params.set('type', t);
  if (f) params.set('from', f);
  if (to) params.set('to', to);
  const d = await api(`movements?${params}`);
  document.getElementById('mv-table').innerHTML = mvTable(d.rows);
}

function exportMovements() {
  const params = new URLSearchParams();
  const c = document.getElementById('mf-case').value;
  const t = document.getElementById('mf-type').value;
  const f = document.getElementById('mf-from').value;
  const to = document.getElementById('mf-to').value;
  if (c) params.set('case', c);
  if (t) params.set('type', t);
  if (f) params.set('from', f);
  if (to) params.set('to', to);
  window.open(`/api/movements/export?${params}`, '_blank');
}

// ── reports ──
async function viewReports() {
  let html = `<h1>報表</h1>`;
  html += `<div class="card">
    <div class="form-row">
      <div class="field"><label>從</label><input class="input" type="date" id="rf-from"></div>
      <div class="field"><label>到</label><input class="input" type="date" id="rf-to"></div>
      <div class="field"><label>案號</label><input class="input" id="rf-case" placeholder="如 26-023" list="case-list"></div>
      <div class="field"><label>單號</label><input class="input" id="rf-slipo" placeholder="如 S-2026-0001"></div>
      <div class="field"><label>分組</label><select class="select" id="rf-group"><option value="item">品名</option><option value="case">案號</option><option value="type">類型</option></select></div>
      <div class="field"><label>類型</label><select class="select" id="rf-type"><option value="">全部</option><option value="out">出倉</option><option value="in">進倉</option><option value="return">回倉</option><option value="transfer">轉移</option></select></div>
      <button class="btn btn-primary btn-sm" onclick="runReport()" style="align-self:flex-end">產生</button>
      <button class="btn btn-secondary btn-sm" onclick="exportReport()" style="align-self:flex-end">CSV</button>
    </div>
  </div>`;
  html += `<div class="card" id="report-result"><p class="muted">設定條件後點「產生」</p></div>`;
  $main.innerHTML = html;
}

async function runReport() {
  const params = new URLSearchParams();
  const f = document.getElementById('rf-from').value;
  const to = document.getElementById('rf-to').value;
  const g = document.getElementById('rf-group').value;
  const t = document.getElementById('rf-type').value;
  const cs = document.getElementById('rf-case').value;
  const sn = document.getElementById('rf-slipo').value;
  if (f) params.set('from', f);
  if (to) params.set('to', to);
  if (g) params.set('group', g);
  if (t) params.set('type', t);
  if (cs) params.set('case', cs);
  if (sn) params.set('slip_no', sn);
  const d = await api(`movements/movements?${params}`);
  let html = `<p class="muted">共 ${d.count} 筆</p>`;
  if (d.rows.length) {
    html += `<table><thead><tr><th>${g==='case'?'案號':g==='type'?'類型':'品名'}</th><th>次數</th><th>流入</th><th>流出</th></tr></thead><tbody>`;
    html += d.rows.map(r => `<tr><td>${r.grp||'-'}</td><td class="mono">${r.cnt}</td><td class="mono" style="color:var(--c-success)">${r.inflow}</td><td class="mono" style="color:var(--c-danger)">${r.outflow}</td></tr>`).join('');
    html += `</tbody></table>`;
  } else html += empty('無資料');
  document.getElementById('report-result').innerHTML = html;
}

function exportReport() {
  const params = new URLSearchParams();
  const f = document.getElementById('rf-from').value;
  const to = document.getElementById('rf-to').value;
  const g = document.getElementById('rf-group').value;
  const t = document.getElementById('rf-type').value;
  const cs = document.getElementById('rf-case').value;
  const sn = document.getElementById('rf-slipo').value;
  if (f) params.set('from', f);
  if (to) params.set('to', to);
  if (g) params.set('group', g);
  if (t) params.set('type', t);
  if (cs) params.set('case', cs);
  if (sn) params.set('slip_no', sn);
  params.set('format', 'csv');
  window.open(`/api/movements/movements?${params}`, '_blank');
}

// ── settings (設備初始設置) ──
async function viewSettings() {
  const d = await api('items');
  let html = `<h1>設備設置</h1>`;

  // 新增器材表單
  html += `<div class="card">
    <h2>新增器材</h2>
    <div class="form-row">
      <div class="field"><label>類型</label>
        <select class="select" id="ns-kind">
          <option value="equipment">設備（個體管理，有編號）</option>
          <option value="consumable">耗材（數量管理，+/-）</option>
        </select></div>
      <div class="field"><label>品名 *</label><input class="input" id="ns-name" placeholder="如 鑽機 / 二重管"></div>
      <div class="field"><label>規格</label><input class="input" id="ns-spec" placeholder="如 D2-JS / 3M"></div>
      <div class="field"><label>別名（逗號分隔）</label><input class="input" id="ns-aliases" placeholder="如 洗網機,洗車機"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>代碼</label><input class="input" id="ns-code" placeholder="如 E-G-Q-B"></div>
      <div class="field"><label>單位</label><input class="input" id="ns-unit" placeholder="如 支/台/桶"></div>
      <div class="field"><label>價格</label><input class="input" type="number" id="ns-price" placeholder="0"></div>
      <div class="field"><label>分類Ⅰ</label><input class="input" id="ns-cat1" placeholder="E"></div>
      <div class="field"><label>分類Ⅱ</label><input class="input" id="ns-cat2" placeholder="G"></div>
      <div class="field"><label>分類Ⅲ</label><input class="input" id="ns-cat3" placeholder="Q"></div>
      <div class="field"><label>分類Ⅳ</label><input class="input" id="ns-cat4" placeholder="B"></div>
    </div>
    <div class="field"><label>備註</label><input class="input" id="ns-note"></div>
    <div id="ns-stock-row" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--c-border)">
      <div class="form-row">
        <div class="field"><label>初始庫存數量</label><input class="input" type="number" id="ns-init-qty" value="0"></div>
        <div class="field"><label>安全庫存</label><input class="input" type="number" id="ns-safety" value="0"></div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="createItem()" style="margin-top:12px">建立器材</button>
  </div>`;

  // 器材列表
  html += `<div class="card"><h2>器材列表 (${d.count})</h2>`;
  if (d.rows.length) {
    html += `<table><thead><tr><th>品名</th><th>類型</th><th>規格</th><th>別名</th><th>單位</th><th>庫存/數量</th><th>操作</th></tr></thead><tbody>`;
    for (const r of d.rows) {
      const isEq = r.kind === 'equipment';
      html += `<tr id="item-row-${r.id}">
        <td><strong>${r.name}</strong>${r.code?` <span class="faint mono">${r.code}</span>`:''}</td>
        <td>${isEq?'<span class="badge in_stock">設備</span>':'<span class="badge type-transfer">耗材</span>'}</td>
        <td>${r.spec||'-'}</td>
        <td class="muted">${r.aliases||'-'}</td>
        <td>${r.unit||'-'}</td>
        <td id="stock-cell-${r.id}" class="mono">${isEq?'—':'載入中...'}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="editItem(${r.id})">編輯</button> <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="delRecord('items/${r.id}','${r.name.replace(/'/g,"\\'")}')" title="刪除">✕</button></td>
      </tr>`;
    }
    html += `</tbody></table>`;
  } else html += empty('尚無器材，請先新增');
  html += `</div>`;

  $main.innerHTML = html;

  // 類型切換顯示/隱藏初始庫存欄位
  document.getElementById('ns-kind').addEventListener('change', e => {
    document.getElementById('ns-stock-row').style.display = e.target.value === 'consumable' ? '' : 'none';
  });

  // 載入每個耗材的庫存
  for (const r of d.rows) {
    if (r.kind === 'consumable') loadStockCell(r.id);
    else document.getElementById(`stock-cell-${r.id}`).textContent = '—';
  }
}

async function loadStockCell(itemId) {
  try {
    const d = await api(`stock?item=${itemId}`);
    const cell = document.getElementById(`stock-cell-${itemId}`);
    if (!d.rows.length) { cell.textContent = '0'; cell.style.color = 'var(--c-text-faint)'; return; }
    cell.innerHTML = d.rows.map(s =>
      `<span style="color:${s.qty<=s.safety_qty?'var(--c-danger)':'var(--c-text)'}">${s.qty}</span>${s.condition!=='good'?' <span class="badge '+s.condition+'">'+s.condition+'</span>':''}`
    ).join(' / ');
    cell.style.cursor = 'pointer';
    cell.onclick = () => openStockAdjust(itemId);
  } catch { document.getElementById(`stock-cell-${itemId}`).textContent = '?'; }
}

let _stockItemName = {};
async function openStockAdjust(itemId) {
  const d = await api(`stock?item=${itemId}`);
  const itemName = d.rows[0]?.name || '';
  const existing = d.rows;
  const total = existing.reduce((s,r) => s+r.qty, 0);
  let html = `<div class="card" style="max-width:500px;margin:0 auto">
    <h2>庫存調整 — ${itemName}</h2>
    <p class="muted">目前總量：<span class="mono" style="font-size:18px;font-weight:700">${total}</span></p>`;
  if (existing.length) {
    html += `<table style="margin:8px 0"><thead><tr><th>狀態</th><th>數量</th><th>安全庫存</th></tr></thead><tbody>`;
    html += existing.map(s => `<tr><td><span class="badge ${s.condition==='good'?'in_stock':s.condition}">${s.condition}</span></td><td class="mono">${s.qty}</td><td class="mono">${s.safety_qty||0}</td></tr>`).join('');
    html += `</tbody></table>`;
  }
  html += `<div class="form-row" style="margin-top:12px">
    <div class="field"><label>調整數量（+增加 / -減少）</label><input class="input" type="number" id="adj-delta" placeholder="如 10 或 -5"></div>
    <div class="field"><label>狀態</label><select class="select" id="adj-cond"><option value="good">good（可用）</option><option value="repair">repair（待修）</option><option value="scrapped">scrapped（報廢）</option></select></div>
  </div>
  <div class="field"><label>備註</label><input class="input" id="adj-note" placeholder="如 進貨5支 / 壞掉3支"></div>
  <div style="display:flex;gap:8px;margin-top:8px">
    <button class="btn btn-primary" onclick="adjustStock(${itemId})">確認調整</button>
    <button class="btn btn-secondary" onclick="view='settings';render()">取消</button>
  </div>
  </div>`;
  $main.innerHTML = `<h1>庫存調整</h1>${html}`;
}

async function adjustStock(itemId) {
  const delta = parseInt(document.getElementById('adj-delta').value);
  const cond = document.getElementById('adj-cond').value;
  const note = document.getElementById('adj-note').value;
  if (!delta) return toast('請輸入調整數量（正/負）', 'error');
  try {
    await api('stock/adjust', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ item_id: itemId, delta, condition: cond, note })
    });
    toast(`已調整 ${delta > 0 ? '+' : ''}${delta}`, 'success');
    view = 'settings'; render();
  } catch (e) { toast(e.message, 'error'); }
}

async function createItem() {
  const kind = document.getElementById('ns-kind').value;
  const name = document.getElementById('ns-name').value.trim();
  if (!name) return toast('請填品名', 'error');
  const body = {
    kind,
    name,
    spec: document.getElementById('ns-spec').value || null,
    aliases: document.getElementById('ns-aliases').value || null,
    code: document.getElementById('ns-code').value || null,
    unit: document.getElementById('ns-unit').value || null,
    price: parseFloat(document.getElementById('ns-price').value) || null,
    cat1: document.getElementById('ns-cat1').value || null,
    cat2: document.getElementById('ns-cat2').value || null,
    cat3: document.getElementById('ns-cat3').value || null,
    cat4: document.getElementById('ns-cat4').value || null,
    note: document.getElementById('ns-note').value || null,
  };
  try {
    const r = await api('items', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const itemId = r.id;
    // 若耗材且有初始庫存
    if (kind === 'consumable') {
      const initQty = parseInt(document.getElementById('ns-init-qty').value) || 0;
      const safety = parseInt(document.getElementById('ns-safety').value) || 0;
      if (initQty !== 0 || safety > 0) {
        await api('stock', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ item_id: itemId, condition:'good', qty: initQty, safety_qty: safety })
        });
      }
    }
    toast(`已建立：${name}`, 'success');
    view = 'settings'; render();
  } catch (e) { toast(e.message, 'error'); }
}

async function editItem(id) {
  const d = await api(`items/${id}`);
  let html = `<div class="card" style="max-width:600px;margin:0 auto">
    <h2>編輯器材</h2>
    <div class="form-row">
      <div class="field"><label>類型</label><select class="select" id="ei-kind" disabled><option value="${d.kind}">${d.kind==='equipment'?'設備':'耗材'}</option></select></div>
      <div class="field"><label>品名</label><input class="input" id="ei-name" value="${d.name||''}"></div>
      <div class="field"><label>規格</label><input class="input" id="ei-spec" value="${d.spec||''}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>別名</label><input class="input" id="ei-aliases" value="${d.aliases||''}"></div>
      <div class="field"><label>代碼</label><input class="input" id="ei-code" value="${d.code||''}"></div>
      <div class="field"><label>單位</label><input class="input" id="ei-unit" value="${d.unit||''}"></div>
      <div class="field"><label>價格</label><input class="input" type="number" id="ei-price" value="${d.price||''}"></div>
    </div>
    <div class="field"><label>備註</label><input class="input" id="ei-note" value="${d.note||''}"></div>`;
  if (d.kind === 'equipment') {
    html += `<div style="margin-top:12px;border-top:1px solid var(--c-border);padding-top:12px">
      <div class="section-title">設備個體（編號）</div>
      <div id="unit-list"></div>
      <div class="form-row" style="margin-top:8px">
        <div class="field" style="max-width:120px"><label>新增編號</label><input class="input" id="ei-new-serial" placeholder="#23"></div>
        <div class="field" style="max-width:120px"><label>狀態</label><select class="select" id="ei-new-status"><option value="in_stock">在庫</option><option value="out">在外</option><option value="repair">待修</option></select></div>
        <div class="field" style="max-width:120px"><label>地點</label><input class="input" id="ei-new-loc" placeholder="倉庫"></div>
        <button class="btn btn-secondary btn-sm" onclick="addUnit(${id})" style="align-self:flex-end">＋ 新增</button>
      </div>
    </div>`;
  }
  html += `<div style="display:flex;gap:8px;margin-top:16px">
    <button class="btn btn-primary" onclick="saveItem(${id})">儲存</button>
    <button class="btn btn-secondary" onclick="view='settings';render()">取消</button>
  </div>
  </div>`;
  $main.innerHTML = `<h1>編輯器材</h1>${html}`;
  if (d.kind === 'equipment') loadUnits(id);
}

async function loadUnits(itemId) {
  try {
    const d = await api(`units?item=${itemId}`);
    const c = document.getElementById('unit-list');
    if (!d.rows.length) { c.innerHTML = '<p class="muted">尚無個體</p>'; return; }
    c.innerHTML = '<table><thead><tr><th>編號</th><th>狀態</th><th>地點</th></tr></thead><tbody>' +
      d.rows.map(u => `<tr><td class="mono">#${u.serial||''}</td><td>${badge(u.status)}</td><td>${u.location||'-'}</td></tr>`).join('') +
      '</tbody></table>';
  } catch { document.getElementById('unit-list').innerHTML = '<p class="muted">載入失敗</p>'; }
}

async function addUnit(itemId) {
  const serial = document.getElementById('ei-new-serial').value.trim();
  const status = document.getElementById('ei-new-status').value;
  const loc = document.getElementById('ei-new-loc').value.trim() || '倉庫';
  if (!serial) return toast('請填編號', 'error');
  try {
    await api(`items/${itemId}/units`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ serial, status, location: loc })
    });
    toast(`已新增 #${serial}`, 'success');
    loadUnits(itemId);
    document.getElementById('ei-new-serial').value = '';
  } catch (e) { toast(e.message, 'error'); }
}

async function saveItem(id) {
  const body = {
    name: document.getElementById('ei-name').value,
    spec: document.getElementById('ei-spec').value || null,
    aliases: document.getElementById('ei-aliases').value || null,
    code: document.getElementById('ei-code').value || null,
    unit: document.getElementById('ei-unit').value || null,
    price: parseFloat(document.getElementById('ei-price').value) || null,
    note: document.getElementById('ei-note').value || null,
  };
  try {
    await api(`items/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('已儲存', 'success');
    view = 'settings'; render();
  } catch (e) { toast(e.message, 'error'); }
}

// ── health check ──
async function checkHealth() {
  try {
    const h = await api('health');
    document.getElementById('health').textContent = `items:${h.items} units:${h.units} slips:${h.slips}`;
  } catch {
    document.getElementById('health').textContent = '離線';
  }
}

// ── expose ──
window.addItemRow = addItemRow;
window.acSearch = acSearch;
window.submitSlip = submitSlip;
window.searchSlips = searchSlips;
window.goSlip = goSlip;
window.confirmSlip = confirmSlip;
window.searchUnits = searchUnits;
window.goHistory = goHistory;
window.searchStock = searchStock;
window.searchMovements = searchMovements;
window.exportMovements = exportMovements;
window.runReport = runReport;
window.exportReport = exportReport;
window.goHistory = goHistory;
window.viewSettings = viewSettings;
window.createItem = createItem;
window.editItem = editItem;
window.saveItem = saveItem;
window.addUnit = addUnit;
window.loadUnits = loadUnits;
window.openStockAdjust = openStockAdjust;
window.adjustStock = adjustStock;
window.loadStockCell = loadStockCell;
window.onTypeChange = onTypeChange;
window.goHistory2 = goHistory2;
window.delRecord = delRecord;
window.editSlip = editSlip;
window.saveSlip = saveSlip;
window.delSlipItem = delSlipItem;
window.editUnit = editUnit;
window.saveUnit = saveUnit;
window.editStock = editStock;
window.saveStock = saveStock;
window.delMv = delMv;
window.editMv = editMv;
window.saveMv = saveMv;

const views = {
  dashboard: viewDashboard,
  newslip: viewNewSlip,
  slips: viewSlips,
  units: viewUnits,
  stock: viewStock,
  movements: viewMovements,
  reports: viewReports,
  settings: viewSettings,
};

checkHealth();
render();
