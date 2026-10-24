const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)], app = $('#app');
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kes = n => 'KSh ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
let T = localStorage.getItem('ustawiAdmin') || '', ROLE = '', tab = 'overview';
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); };
const api = async (url, o = {}) => {
  const r = await fetch(url, { ...o, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T }, body: o.body ? JSON.stringify(o.body) : undefined });
  if (r.status === 401) { T = ''; localStorage.removeItem('ustawiAdmin'); login(); throw new Error('Please log in'); }
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Failed'); return d;
};
const ST = ['Pending', 'Confirmed', 'In Progress', 'Ready for Collection', 'Out for Delivery', 'Completed', 'Cancelled'];
const badge = s => `<span class="badge ${s}">${esc(String(s).replace('_', ' '))}</span>`;

function login(msg = '') {
  app.innerHTML = `<form class="login" id="lf"><h1>Ustawi admin</h1><p class="err">${esc(msg)}</p><label>Phone<input name="phone" required inputmode="tel"></label><label>Password<input name="password" type="password" required></label><button class="btn">Log in</button><p><a href="/">Back to website</a></p></form>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }), d = await r.json();
      if (!r.ok) throw new Error(d.error); if (d.role === 'customer') throw new Error('This account is not a staff account.');
      T = d.token; ROLE = d.role; localStorage.setItem('ustawiAdmin', T); shell();
    } catch (er) { login(er.message); }
  };
}
function shell() {
  try { ROLE = JSON.parse(atob(T.split('.')[1])).role; } catch { return login(); }
  const tabs = [['overview', 'Overview'], ['orders', 'Orders'], ['payments', 'Payments'], ['customers', 'Customers'], ['services', 'Services & prices']];
  app.innerHTML = `<div class="adm"><aside><h1>Ustawi</h1>${tabs.map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}<button id="lo">Log out</button></aside><main id="main"></main></div>`;
  $$('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; shell(); }); $('#lo').onclick = () => { T = ''; localStorage.removeItem('ustawiAdmin'); login(); };
  ({ overview, orders, payments, customers, services })[tab]().catch(e => toast(e.message));
}
async function overview() {
  const s = await api('/api/admin/summary'), c = n => (s.byStatus.find(x => x.status === n) || {}).c || 0, max = Math.max(1, ...s.daily.map(d => d.s));
  $('#main').innerHTML = `<h2>Overview</h2><div class="cards3"><div class="stat"><small>Verified revenue (all time)</small><strong>${kes(s.revenue)}</strong></div><div class="stat"><small>Today</small><strong>${kes(s.today)}</strong></div><div class="stat"><small>Last 7 days</small><strong>${kes(s.week)}</strong></div><div class="stat"><small>This month</small><strong>${kes(s.month)}</strong></div>
  <div class="stat"><small>Outstanding payments</small><strong>${kes(s.outstanding)}</strong></div><div class="stat"><small>Awaiting verification</small><strong>${s.awaiting}</strong></div><div class="stat"><small>Pending orders</small><strong>${c('Pending')}</strong></div><div class="stat"><small>Completed orders</small><strong>${c('Completed')}</strong></div></div>
  <h3>Verified revenue, last 14 days</h3><div class="bars">${s.daily.map(d => `<div style="height:${d.s / max * 100}%" title="${d.d}: ${kes(d.s)}"><span>${d.d.slice(5)}</span></div>`).join('') || '<p class="mute">No verified payments yet.</p>'}</div>
  <h3 style="margin-top:2.2rem">Revenue by service (fully paid orders)</h3><div class="table-wrap"><table><tbody>${s.byDept.map(d => `<tr><td>${esc(d.dept)}</td><td>${kes(d.s)}</td></tr>`).join('') || '<tr><td>No paid orders yet.</td></tr>'}</tbody></table></div>
  <p class="mute">Revenue counts only payments verified by M-Pesa (Daraja) or by an admin. Expenses and profit tracking are not included in this version.</p>`;
}
const getFile = async (url, name) => { const r = await fetch(url, { headers: { Authorization: 'Bearer ' + T } }); if (!r.ok) return toast((await r.json().catch(() => ({}))).error || 'Failed'); const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click(); };
async function orders() {
  $('#main').innerHTML = `<h2>Orders</h2><div class="toolbar"><input id="q" placeholder="Search order, name, phone"><select id="st"><option value="">All statuses</option>${ST.map(s => `<option>${s}</option>`).join('')}</select><button class="btn small" id="csv">Export CSV</button></div><div class="table-wrap" id="ot"></div>`;
  const load = async () => {
    const rows = await api(`/api/admin/orders?status=${encodeURIComponent($('#st').value)}&q=${encodeURIComponent($('#q').value)}`);
    $('#ot').innerHTML = `<table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(o => `<tr><td>${o.ref}<br><small>${o.created.slice(0, 16)}</small></td><td>${esc(o.name)}<br><small>0${o.phone.slice(3)} · ${esc(o.method)}</small></td>
    <td><small>${o.items.map(i => `${esc(i.name)}${i.from_price ? ' (from)' : ''} ×${i.qty}`).join('<br>')}</small>${o.notes ? `<br><small><em>${esc(o.notes)}</em></small>` : ''}</td><td>${kes(o.total)}${ROLE === 'admin' ? `<br><button class="btn small ghost" data-tot="${o.id}" data-v="${o.total}">Edit total</button>` : ''}</td><td>${kes(o.paid)}<br>${badge(o.pay_status)}</td>
    <td><select data-id="${o.id}">${ST.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><button class="btn small ghost" data-cash="${o.id}">Record cash</button><button class="btn small ghost" data-rc="${o.id}" data-ref="${o.ref}">Receipt</button></td></tr>`).join('') || '<tr><td colspan="7">No orders.</td></tr>'}</tbody></table>`;
    $$('select[data-id]').forEach(s => s.onchange = async () => { try { await api('/api/admin/orders/' + s.dataset.id, { method: 'PATCH', body: { status: s.value } }); toast('Status updated'); } catch (e) { toast(e.message); } });
    $$('[data-cash]').forEach(b => b.onclick = async () => { const a = prompt('Cash received (KSh):'); if (!a) return; try { await api(`/api/admin/orders/${b.dataset.cash}/cash`, { method: 'POST', body: { amount: a } }); toast('Cash recorded'); load(); } catch (e) { toast(e.message); } });
    $$('[data-tot]').forEach(b => b.onclick = async () => { const a = prompt('Final total for this order (KSh). Use this when "from" items are priced after inspection:', b.dataset.v); if (!a) return; try { await api(`/api/admin/orders/${b.dataset.tot}/total`, { method: 'PATCH', body: { total: a } }); toast('Total updated'); load(); } catch (e) { toast(e.message); } });
    $$('[data-rc]').forEach(b => b.onclick = () => getFile(`/api/admin/orders/${b.dataset.rc}/receipt`, `Receipt-${b.dataset.ref}.pdf`));
  };
  $('#q').oninput = () => { clearTimeout(orders.t); orders.t = setTimeout(load, 300); }; $('#st').onchange = load;
  $('#csv').onclick = () => getFile('/api/admin/export/orders.csv', 'orders.csv');
  load();
}
async function payments() {
  const rows = await api('/api/admin/payments');
  $('#main').innerHTML = `<h2>Payments</h2><p class="mute">Check each submitted M-Pesa message against your Till statement before verifying. Only verified payments count as revenue and unlock the customer's receipt.</p><div class="table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Method</th><th>Code</th><th>Amount</th><th>Order total</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p => `<tr><td>${p.created.slice(0, 16)}</td><td>${p.ref}<br><small>${esc(p.name)}</small></td><td>${p.method}</td><td>${esc(p.mpesa_code || '')}${p.raw ? `<br><small>${esc(p.raw.slice(0, 120))}</small>` : ''}</td><td>${p.amount == null ? '?' : kes(p.amount)}</td><td>${kes(p.total)}</td><td>${badge(p.status)}</td>
  <td>${p.status === 'awaiting_verification' && ROLE === 'admin' ? `<button class="btn small" data-v="${p.id}" data-a="${p.amount ?? p.total}">Verify</button><button class="btn small ghost" data-x="${p.id}">Reject</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8">No payments yet.</td></tr>'}</tbody></table></div>`;
  $$('[data-v]').forEach(b => b.onclick = async () => { const a = prompt('Amount confirmed on your Till statement (KSh):', b.dataset.a); if (!a) return; try { await api(`/api/admin/payments/${b.dataset.v}/verify`, { method: 'POST', body: { amount: a } }); toast('Payment verified'); payments(); } catch (e) { toast(e.message); } });
  $$('[data-x]').forEach(b => b.onclick = async () => { if (!confirm('Reject this payment?')) return; try { await api(`/api/admin/payments/${b.dataset.x}/reject`, { method: 'POST' }); payments(); } catch (e) { toast(e.message); } });
}
async function customers() {
  const rows = await api('/api/admin/customers');
  $('#main').innerHTML = `<h2>Customers</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Joined</th><th>Orders</th><th>Billed</th></tr></thead><tbody>${rows.map(c => `<tr><td>${esc(c.name)}</td><td>0${c.phone.slice(3)}</td><td>${esc(c.email)}</td><td>${c.created.slice(0, 10)}</td><td>${c.orders}</td><td>${kes(c.billed)}</td></tr>`).join('') || '<tr><td colspan="6">No registered customers yet.</td></tr>'}</tbody></table></div>`;
}
let SQ = '', SD = '';
async function services() {
  const rows = await api('/api/admin/services'), D = ['laundry', 'computer', 'stationery', 'tailoring'], ro = ROLE !== 'admin', dis = ro ? 'disabled' : '';
  $('#main').innerHTML = `<h2>Services &amp; prices</h2><p class="mute">Edit any price, then press <strong>Save changes</strong>. The website, the order page and the price calculators use the new prices immediately. A price of 0 hides an item. Tick <em>From</em> for starting prices.${ro ? ' (Staff accounts can view prices but not change them.)' : ''}</p>
  <div class="tools"><input id="fq" placeholder="Search items" value="${esc(SQ)}" style="max-width:240px"><select id="fd" style="width:auto"><option value="">All departments</option>${D.map(d => `<option ${SD === d ? 'selected' : ''}>${d}</option>`).join('')}</select><span class="mute" id="cnt"></span>
  ${ro ? '' : '<button class="btn small ghost" id="bk">Change prices by %</button><button class="btn small ghost" id="ad">Add item</button><button class="btn small ghost" id="ld">Load default price list</button>'}<button class="btn small ghost" id="ex">Export CSV</button></div><div id="pn"></div>
  <div class="table-wrap"><table><thead><tr><th>Dept</th><th>Name</th><th>Unit</th><th>Price (KSh)</th><th>From</th><th>Active</th><th></th></tr></thead><tbody>${rows.map(s => `<tr data-id="${s.id}" data-d="${s.dept}" data-n="${esc((s.name + ' ' + s.unit).toLowerCase())}"><td>${s.dept}</td><td><input value="${esc(s.name)}" data-f="name" ${dis}></td><td><input value="${esc(s.unit)}" data-f="unit" ${dis}></td><td><input type="number" min="0" step="1" value="${s.price}" data-f="price" ${dis}></td><td><input type="checkbox" data-f="from_price" ${s.from_price ? 'checked' : ''} ${dis}></td><td><input type="checkbox" data-f="active" ${s.active ? 'checked' : ''} ${dis}></td><td>${ro ? '' : '<button class="btn small ghost" data-del>Delete</button>'}</td></tr>`).join('')}</tbody></table></div>
  ${ro ? '' : '<div class="sticky-save"><button class="btn" id="sv" hidden></button></div>'}`;
  const filt = () => { SQ = $('#fq').value.toLowerCase(); SD = $('#fd').value; let n = 0; $$('tbody tr').forEach(tr => { const ok = (!SD || tr.dataset.d === SD) && (!SQ || tr.dataset.n.includes(SQ)); tr.hidden = !ok; n += ok; }); $('#cnt').textContent = n + ' items'; };
  $('#fq').oninput = filt; $('#fd').onchange = filt; filt();
  $('#ex').onclick = () => getFile('/api/admin/export/prices.csv', 'ustawi-prices.csv');
  if (ro) return;
  const sv = $('#sv'), upd = () => { const n = $$('tr.dirty').length; sv.hidden = !n; sv.textContent = `Save changes (${n})`; };
  $('tbody').addEventListener('input', e => { e.target.closest('tr').classList.add('dirty'); upd(); });
  const val = (tr, f) => { const i = $(`[data-f=${f}]`, tr); return i.type === 'checkbox' ? i.checked : i.value; };
  sv.onclick = async () => { sv.disabled = true; let ok = 0;
    for (const tr of $$('tr.dirty')) { try { await api('/api/admin/services/' + tr.dataset.id, { method: 'PUT', body: { name: val(tr, 'name'), unit: val(tr, 'unit'), price: val(tr, 'price'), active: val(tr, 'active'), from_price: val(tr, 'from_price') } }); tr.classList.remove('dirty'); ok++; } catch (er) { toast(er.message); break; } }
    sv.disabled = false; upd(); if (ok) toast(`${ok} price${ok > 1 ? 's' : ''} saved`); };
  $$('[data-del]').forEach(b => b.onclick = async () => { const tr = b.closest('tr'); if (!confirm(`Delete "${val(tr, 'name')}"? (If it was used in past orders it is hidden instead.)`)) return; try { const r = await api('/api/admin/services/' + tr.dataset.id, { method: 'DELETE' }); toast(r.hidden ? 'Hidden (used in past orders)' : 'Deleted'); services(); } catch (er) { toast(er.message); } });
  $('#ld').onclick = async () => { if (!confirm('Add any items from the Ustawi default price list that are missing? Your existing prices will not be changed.')) return; try { const r = await api('/api/admin/services/load-defaults', { method: 'POST' }); toast(`${r.added} item${r.added === 1 ? '' : 's'} added`); services(); } catch (er) { toast(er.message); } };
  $('#bk').onclick = () => { $('#pn').innerHTML = `<div class="panel"><strong>Change prices by a percentage</strong><form id="bf"><label>Department<select name="dept"><option value="all">All departments</option>${D.map(d => `<option>${d}</option>`).join('')}</select></label><label>Percent (e.g. 10 or -5)<input name="percent" type="number" step="0.1" required></label><label>Round to nearest<select name="round"><option value="5">KSh 5</option><option value="10">KSh 10</option><option value="1">KSh 1</option></select></label><button class="btn">Apply</button></form></div>`;
    $('#bf').onsubmit = async e => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); if (!confirm(`Change ${b.dept === 'all' ? 'ALL' : b.dept} prices by ${b.percent}%?`)) return; try { const r = await api('/api/admin/services/bulk', { method: 'POST', body: b }); toast(`${r.changed} prices updated`); services(); } catch (er) { toast(er.message); } }; };
  $('#ad').onclick = () => { $('#pn').innerHTML = `<div class="panel"><strong>Add item</strong><form id="nf"><label>Department<select name="dept">${D.map(d => `<option>${d}</option>`).join('')}</select></label><label>Name<input name="name" required></label><label>Unit<input name="unit" placeholder="e.g. per kg"></label><label>Price<input name="price" type="number" min="0" required></label><label style="flex:0 0 auto;display:flex;gap:.4rem;align-items:center"><input type="checkbox" name="from_price" style="width:auto"> From</label><button class="btn">Add</button></form></div>`;
    $('#nf').onsubmit = async e => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); b.from_price = !!b.from_price; try { await api('/api/admin/services', { method: 'POST', body: b }); toast('Item added'); services(); } catch (er) { toast(er.message); } }; };
}
T ? shell() : login();
