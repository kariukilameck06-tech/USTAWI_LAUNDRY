const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kes = n => 'KSh ' + Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const view = $('#view'), stage = $('.stage');
let CFG = {}, SERVICES = [], lastFetch = 0, token = localStorage.getItem('ustawiToken') || '', timer, sliderT, rid = 0;
let cart = JSON.parse(localStorage.getItem('ustawiCart') || '{}'), CALC = [];
const DEPTS = {
  laundry: { n: 'Laundry', e: '🧺', d: 'Washing, drying, ironing and folding for clothes, bedsheets, blankets, duvets and curtains.' },
  computer: { n: 'Computer services', e: '💻', d: 'Printing, copying, scanning, typing, CVs, online applications and computer help.' },
  stationery: { n: 'Stationery', e: '✏️', d: 'Exercise books, pens, files, paper, calculators and other school and office supplies.' },
  tailoring: { n: 'Tailoring', e: '🧵', d: 'Alterations, repairs, zip replacement and stitching for school, office and everyday wear.' }
};
const ICON = { Hero: '🧺', deliver: '🚚', ...Object.fromEntries(Object.entries(DEPTS).map(([k, v]) => [k, v.e])) };
const PSL = { paid: 'PAID', unpaid: 'UNPAID', partial: 'PART PAID', awaiting: 'PAYMENT PENDING' };

// Map internal keys to the user's specific AVIF filenames
const IMG_MAP = {
  computer: 'Comp',
  tailoring: 'tailor',
  hero: 'Hero',
  stationery: 'station',
  laundry: 'Laundry',
  delivery: 'deliver'
};

const img = (n, alt, cls = '') => {
  const fileName = IMG_MAP[n] || n;
  return `<img class="${cls}" src="images/${fileName}.avif" alt="${esc(alt)}" loading="lazy" data-n="${n}" data-e="${ICON[n] || '🧺'}">`;
};

document.addEventListener('error', e => { 
  const t = e.target; 
  if (t.tagName !== 'IMG') return;
  if (t.dataset.n && !t.dataset.t) { 
    t.dataset.t = 1; 
    const fileName = IMG_MAP[t.dataset.n] || t.dataset.n;
    t.src = `images/${fileName}.avif`; 
    return; 
  }
  const d = document.createElement('div'); d.className = 'ph ' + t.className; d.textContent = t.dataset.e; t.replaceWith(d); 
}, true);

const api = async (url, o = {}) => {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { ...o, headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Something went wrong.'); return d;
};
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800); };
const stepOf = s => /kg/i.test(s.unit) ? .5 : 1;
const snap = (s, q) => { const st = stepOf(s); q = Math.round(q / st) * st; return q > 0 ? Math.min(1000, q) : 0; };
const priceTxt = s => `${s.from_price ? '<span class="frm">from</span>' : ''}${kes(s.price)} ${esc(s.unit)}`;
const saveCart = () => { localStorage.setItem('ustawiCart', JSON.stringify(cart)); const n = items().length, c = $('#cartCount'); c.hidden = !n; c.textContent = n; };
const items = () => Object.entries(cart).map(([id, q]) => ({ s: SERVICES.find(x => x.id == id), q })).filter(x => x.s && x.q > 0);
const total = () => Math.round(items().reduce((a, x) => a + x.s.price * x.q, 0) * 100) / 100;
const hasFrom = () => items().some(x => x.s.from_price);
const normPhone = p => { p = String(p).replace(/\D/g, ''); return p.startsWith('254') ? p : p.startsWith('0') ? '254' + p.slice(1) : p.length === 9 ? '254' + p : p; };
const wa = t => `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(t)}`;
const field = (l, n, extra = '') => `<label>${l}<input name="${n}" ${extra}></label>`;
const due = o => o.due ?? o.total;
const download = async (ref, phone) => {
  try {
    const r = await fetch(`/api/orders/${encodeURIComponent(ref)}/receipt?phone=${encodeURIComponent(phone)}`); if (!r.ok) throw new Error((await r.json()).error);
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `Receipt-${ref}.pdf`; a.click();
  } catch (e) { toast(e.message); }
};
const refreshServices = async () => { try { SERVICES = await api('/api/services'); lastFetch = Date.now(); } catch {} };
const mapQ = () => CFG.mapQuery || CFG.location || 'Nairobi, Kenya';
const mapEmbed = h => `<div class="map"><iframe src="https://maps.google.com/maps?q=${encodeURIComponent(mapQ())}&t=h&z=17&output=embed" loading="lazy" title="Map of Ustawi" allowfullscreen style="min-height:${h}px"></iframe></div>`;

/* ---------- motion helpers ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); $$('[data-count]', e.target).forEach(countUp); } }), { threshold: .12 }) : null;
function reveal() { $$('.reveal', view).forEach((el, i) => { if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', (i % 4) * .08 + 's'); io ? io.observe(el) : el.classList.add('in'); }); }
function countUp(el) {
  const to = +el.dataset.count, sf = el.dataset.suffix || ''; if (reduce) { el.textContent = to + sf; return; }
  const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + sf; if (k < 1) requestAnimationFrame(f); })(t0);
}
const bubbles = () => Array.from({ length: 9 }, () => { const s = 14 + Math.random() * 46; return `<span class="bub" style="width:${s}px;height:${s}px;left:${Math.random() * 100}%;animation-duration:${7 + Math.random() * 9}s;animation-delay:${-Math.random() * 12}s"></span>`; }).join('');
function slider(root) {
  const sl = $('.slides', root), all = $$('.slide', root), n = all.length, dots = $('.dots', root); let i = 0, x0 = null;
  dots.innerHTML = all.map((_, k) => `<button aria-label="Show slide ${k + 1}"></button>`).join('');
  const go = k => { i = (k + n) % n; sl.style.transform = `translateX(-${i * 100}%)`; all.forEach((s, j) => s.classList.toggle('on', j === i)); $$('button', dots).forEach((b, j) => b.classList.toggle('on', j === i)); };
  const auto = () => { clearInterval(sliderT); if (!reduce) sliderT = setInterval(() => go(i + 1), 6500); };
  $('.sl-prev', root).onclick = () => { go(i - 1); auto(); }; $('.sl-next', root).onclick = () => { go(i + 1); auto(); };
  dots.onclick = e => { const k = [...dots.children].indexOf(e.target); if (k >= 0) { go(k); auto(); } };
  root.onmouseenter = () => clearInterval(sliderT); root.onmouseleave = auto;
  root.addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true });
  root.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) { go(i + (dx < 0 ? 1 : -1)); auto(); } });
  go(0); auto();
}

/* ---------- price calculator (reads live prices) ---------- */
const calcHTML = () => `<div class="calc reveal" id="calc"><div><h3>Instant price calculator</h3><p class="sub">Pick an item and quantity. Prices come straight from our current price list.</p>
  <div class="ctl"><label>Department<select id="cD">${Object.entries(DEPTS).map(([k, d]) => `<option value="${k}">${d.e} ${d.n}</option>`).join('')}</select></label>
  <label>Quantity<input id="cQ" type="number" min="1" step="1" value="1" inputmode="decimal"></label><label class="full">Item<select id="cI"></select></label>
  <div class="full prev" id="cP" aria-live="polite"></div><button class="btn full" id="cA" type="button">Add to estimate</button></div></div>
  <div class="res"><h3>Your estimate</h3><div class="lines" id="cL"></div><p class="estnote" id="cN" style="color:#cfe0f5"></p><div>Total <span class="big2" id="cT"></span></div>
  <div class="btnrow" style="margin:.4rem 0 0"><button class="btn" id="cO" type="button">Order these items</button><button class="btn ghost" id="cC" type="button">Clear</button></div></div></div>`;
function bindCalc() {
  const D = $('#cD'), I = $('#cI'), Q = $('#cQ'), P = $('#cP'); if (!D) return;
  const cur = () => SERVICES.find(s => s.id == I.value);
  const prev = () => { const s = cur(); if (!s) { P.textContent = 'No priced items in this department yet.'; return; } Q.step = Q.min = stepOf(s); const q = Number(Q.value) || 0; P.innerHTML = `${q} × ${kes(s.price)} = <strong>${s.from_price ? 'from ' : ''}${kes(s.price * q)}</strong>`; };
  const opts = () => { I.innerHTML = SERVICES.filter(s => s.dept === D.value && s.price > 0).map(s => `<option value="${s.id}">${esc(s.name)} (${s.from_price ? 'from ' : ''}${kes(s.price)} ${esc(s.unit)})</option>`).join(''); prev(); };
  const draw = () => {
    const L = CALC.map((l, k) => ({ ...l, k, s: SERVICES.find(x => x.id == l.id) })).filter(l => l.s);
    $('#cL').innerHTML = L.map(l => `<div class="ln"><span>${esc(l.s.name)} × ${l.q}</span><span>${kes(l.s.price * l.q)} <button type="button" data-x="${l.k}" aria-label="Remove ${esc(l.s.name)}">✕</button></span></div>`).join('') || '<p style="color:#cfe0f5">Add items to see your total.</p>';
    $('#cT').textContent = kes(L.reduce((a, l) => a + l.s.price * l.q, 0)); $('#cN').textContent = L.some(l => l.s.from_price) ? 'Includes "from" items: these are starting prices. The final amount is confirmed when we inspect the item.' : '';
    $('#cO').disabled = !L.length;
  };
  D.onchange = opts; I.onchange = prev; Q.oninput = prev;
  $('#cA').onclick = () => { const s = cur(); if (!s) return; const q = snap(s, Number(Q.value)); if (!q) return toast('Enter a quantity'); const e = CALC.find(l => l.id == s.id); e ? e.q = snap(s, e.q + q) : CALC.push({ id: s.id, q }); Q.value = stepOf(s) === .5 ? 1 : 1; prev(); draw(); };
  $('#cL').onclick = e => { const k = e.target.dataset.x; if (k !== undefined) { CALC.splice(+k, 1); draw(); } };
  $('#cC').onclick = () => { CALC = []; draw(); };
  $('#cO').onclick = () => { CALC.forEach(l => { const s = SERVICES.find(x => x.id == l.id); if (s) cart[s.id] = snap(s, (cart[s.id] || 0) + l.q); }); saveCart(); CALC = []; location.hash = '#/order'; };
  opts(); draw();
}

/* ---------------- pages ---------------- */
const pages = {};
const SLIDES = [
  { a: '#0a2a5c', b: '#12b5a6', img: 'Hero', tag: 'Your Satisfaction, Our Priority', h: 'Fresh laundry, sharp documents, neat tailoring.', p: 'See the price, order online, pay with M-Pesa and track your order from your phone. Four everyday services under one roof.', l: '#/order', t: 'Order now', l2: '#/services', t2: 'See services & prices' },
  { a: '#0369a1', b: '#22d3ee', img: 'Laundry', tag: '🧺 Laundry', h: 'Clean clothes, folded and ready.', p: 'From a T-shirt to a king-size duvet, curtains and carpets. Every item has a clear price.', l: '#/services/laundry', t: 'Laundry prices', l2: '#/order', t2: 'Order now' },
  { a: '#4338ca', b: '#a78bfa', img: 'Comp', tag: '💻 Computer services', h: 'Print, scan, type and apply online.', p: 'Printing from KSh 5 a page, CV writing, lamination, passport photos and computer help.', l: '#/services/computer', t: 'Computer prices', l2: '#/order', t2: 'Order now' },
  { a: '#be185d', b: '#fb7185', img: 'tailor', tag: '🧵 Tailoring', h: 'Alterations and stitching that fit.', p: 'Shorten, adjust, repair or have it made: school uniforms, trousers, dresses, kitenge and suits.', l: '#/services/tailoring', t: 'Tailoring prices', l2: '#/order', t2: 'Order now' },
  { a: '#b45309', b: '#fbbf24', img: 'station', tag: '✏️ Stationery', h: 'Everything for school and office.', p: 'Exercise books, pens, files, paper, calculators and school bags at honest prices.', l: '#/services/stationery', t: 'Stationery prices', l2: '#/order', t2: 'Order now' }
];
pages.home = () => {
  const min = k => { const p = SERVICES.filter(s => s.dept === k && s.price > 0).map(s => s.price); return p.length ? Math.min(...p) : 0; };
  const want = ['Wash and fold', 'Shirt', 'Duvet 5x6', 'Black-and-white printing', 'Colour photocopy', 'CV preparation', 'Trouser shortening', 'Exercise book 96 pages'];
  let pop = want.map(n => SERVICES.find(s => s.name.toLowerCase() === n.toLowerCase() && s.price > 0)).filter(Boolean);
  if (pop.length < 4) pop = SERVICES.filter(s => s.price > 0).filter((_, i) => i % 9 === 0).slice(0, 8);
  const feats = ['🚚 Pickup & delivery', '📲 M-Pesa prompt', '🧾 Receipt with your order number', '🔎 Track your order online', '⚡ Express service on request', '🧺 Laundry', '💻 Computer services', '✏️ Stationery', '🧵 Tailoring'];
  view.innerHTML = `
  <section class="slider" aria-roledescription="carousel" aria-label="Featured services"><div class="slides">${SLIDES.map(s => `<div class="slide" style="--a:${s.a};--b:${s.b}">${bubbles()}
    <div class="txt"><span class="tag">${s.tag}</span>${s.img === 'Hero' ? `<h1>${s.h}</h1>` : `<h2>${s.h}</h2>`}<p class="lead">${s.p}</p>
      <div class="cta"><a class="btn" href="${s.l}" style="background:#fff;color:#0a2a5c">${s.t}</a><a class="btn ghost" href="${s.l2}">${s.t2}</a></div><p class="pay" style="color:#ffffffcc">Pay with M-Pesa prompt or Till <strong>${esc(CFG.till)}</strong></p></div>
    <div class="pic"><img src="images/${s.img}.avif" data-n="${s.img}" data-e="${ICON[s.img]}" alt="${esc(s.tag)}"></div></div>`).join('')}</div>
    <button class="sl-arrow sl-prev" aria-label="Previous slide">‹</button><button class="sl-arrow sl-next" aria-label="Next slide">›</button><div class="dots"></div></section>
  <section class="marq" aria-hidden="true"><div>${[...feats, ...feats].map(f => `<span>${f}</span>`).join('')}</div></section>
  <section class="wrap"><div class="sec-h reveal"><h2>What we do</h2><a class="btn ghost small" href="#/services">All prices</a></div><div class="cards4">${Object.entries(DEPTS).map(([k, d]) =>
    `<a class="card dcard d-${k} reveal" href="#/services/${k}">${img(k, d.n)}<div><h3>${d.e} ${d.n}</h3><p>${d.d}</p>${min(k) ? `<span class="from">From ${kes(min(k))}</span>` : ''}</div></a>`).join('')}</div></section>
  <section class="wrap alt"><div class="sec-h reveal"><div><h2>Know your bill before you order</h2><p class="sub" style="margin:0">Our calculator uses the same live prices as the order page.</p></div></div>${calcHTML()}</section>
  ${pop.length ? `<section class="wrap"><div class="sec-h reveal"><h2>Popular prices</h2><a class="btn ghost small" href="#/services">Full price list</a></div><div class="chips">${pop.map(s => `<div class="chip d-${s.dept} reveal" style="border-left-color:var(--c)"><small>${DEPTS[s.dept].e} ${esc(s.name)}</small><strong>${s.from_price ? 'from ' : ''}${kes(s.price)}</strong><small>${esc(s.unit)}</small></div>`).join('')}</div></section>` : ''}
  <section class="wrap alt"><div class="stats reveal"><div><strong data-count="${SERVICES.length}">0</strong><span>Items with clear prices</span></div><div><strong data-count="4">0</strong><span>Services under one roof</span></div><div><strong data-count="3">0</strong><span>Ways to pay</span></div><div><strong data-count="24" data-suffix="/7">0</strong><span>Online ordering &amp; tracking</span></div></div></section>
  <section class="wrap"><h2 class="reveal">How ordering works</h2><ol class="steps2">
    <li class="reveal"><div class="icn">🧺</div><h3>Choose</h3><p>Pick items and quantities. The total updates as you go.</p></li>
    <li class="reveal"><div class="icn">📝</div><h3>Your details</h3><p>Name, phone and how you want to collect.</p></li>
    <li class="reveal"><div class="icn">📲</div><h3>Pay</h3><p>Get an M-Pesa prompt on your phone, or pay to our Till.</p></li>
    <li class="reveal"><div class="icn">🧾</div><h3>Receipt &amp; tracking</h3><p>Your receipt shows your order number and whether it is paid. Use the number to track progress.</p></li></ol></section>
  <section class="wrap alt why"><div class="reveal">${img('deliver', 'Pickup and delivery', 'side')}</div><div class="reveal"><h2>Made for regular customers</h2><ul>
    <li><strong>Your own account.</strong> See every booking and payment in one statement.</li><li><strong>Pickup and delivery.</strong> Choose it when you order.</li>
    <li><strong>Clear progress.</strong> From Pending to Ready for Collection.</li><li><strong>Verified payments.</strong> An order shows as PAID only after we confirm the payment.</li></ul><a class="btn" href="#/account">Create an account</a></div></section>
  <section class="wrap"><div class="cta-band reveal"><h2>Ready when you are</h2><p>Order online in two minutes, or send us a message on WhatsApp.</p><div class="btnrow" style="justify-content:center"><a class="btn" href="#/order">Order now</a><a class="btn ghost" href="${wa('Hello Ustawi, I would like to enquire about your services.')}" target="_blank" rel="noopener">Chat on WhatsApp</a></div></div></section>
  <section class="wrap alt" id="find"><h2 class="reveal">Find us</h2><div class="findus"><div class="reveal"><ul>
    <li>📍 ${esc(CFG.location) || 'Visit us in store'}</li><li>🕒 ${esc(CFG.hours) || 'Call or WhatsApp us for opening hours'}</li><li>📞 ${CFG.phone ? `<a href="tel:${esc(CFG.phone)}">${esc(CFG.phone)}</a>` : 'Call us'}</li><li>💳 M-Pesa Till <strong>${esc(CFG.till)}</strong></li></ul>
    <div class="btnrow"><a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQ())}" target="_blank" rel="noopener">Get directions</a><a class="btn ghost" href="#/contact">Contact us</a></div></div>
    <div class="reveal">${mapEmbed(420)}</div></div></section>`;
  slider($('.slider')); bindCalc();
};

pages.services = (dept) => {
  const list = Object.keys(DEPTS).filter(k => !dept || k === dept);
  view.innerHTML = `<section class="wrap"><h2>Services &amp; prices</h2><p class="sub">Prices are in Kenya shillings. “From” means a starting price; the final amount is confirmed when we see the item.</p>
  <input class="search" id="sq" type="search" placeholder="Search items, e.g. shirt, printing, zip" aria-label="Search items">
  <div class="tabs"><a class="tab" aria-selected="${!dept}" href="#/services">All</a>${Object.entries(DEPTS).map(([k, d]) => `<a class="tab d-${k}" aria-selected="${dept === k}" href="#/services/${k}">${d.e} ${d.n}</a>`).join('')}</div>
  ${list.map(k => `<div class="dept d-${k}"><div class="deptimg">${img(k, DEPTS[k].n)}<div><h3>${DEPTS[k].n}</h3><p>${DEPTS[k].d}</p></div></div>
   <div class="table-wrap"><table><thead><tr><th>Item</th><th>Unit</th><th>Price</th><th></th></tr></thead><tbody>
   ${SERVICES.filter(s => s.dept === k).map(s => `<tr data-n="${esc((s.name + ' ' + s.unit).toLowerCase())}"><td>${esc(s.name)}</td><td>${esc(s.unit)}</td><td>${s.price > 0 ? (s.from_price ? '<span class="frm">from</span>' : '') + kes(s.price) : 'Ask us'}</td>
   <td>${s.price > 0 ? `<button class="btn small" data-add="${s.id}">Add</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">No items yet.</td></tr>'}</tbody></table></div></div>`).join('')}
  <p class="mute" id="nomatch" hidden>No items match your search.</p><p class="cta"><a class="btn" href="#/order">Continue to order <span id="svcTot"></span></a></p></section>
  <section class="wrap alt"><h2 class="reveal">Price calculator</h2>${calcHTML()}</section>`;
  const upd = () => $('#svcTot').textContent = total() ? '· ' + kes(total()) : '';
  upd(); $$('[data-add]').forEach(b => b.onclick = () => { const s = SERVICES.find(x => x.id == b.dataset.add); cart[s.id] = snap(s, (cart[s.id] || 0) + stepOf(s) * (stepOf(s) < 1 ? 2 : 1)); saveCart(); upd(); toast(`${s.name} added to your order`); });
  $('#sq').oninput = e => { const q = e.target.value.trim().toLowerCase(); let any = false;
    $$('.dept').forEach(d => { let v = 0; $$('tbody tr[data-n]', d).forEach(r => { const m = !q || r.dataset.n.includes(q); r.hidden = !m; v += m; }); d.hidden = !v; any = any || v > 0; }); $('#nomatch').hidden = any; };
  bindCalc();
};

/* order wizard */
let W = { step: 1, order: null, mode: 'stk', msg: '', ps: 'unpaid', q: '', d: '' };
const stepper = () => `<ol class="wsteps">${['Choose', 'Your details', 'Pay', 'Receipt'].map((n, i) => `<li class="${W.step === i + 1 ? 'on' : W.step > i + 1 ? 'done' : ''}">${n}</li>`).join('')}</ol>`;
pages.order = () => { if (W.step === 4) W = { step: 1, order: null, mode: 'stk', msg: '', ps: 'unpaid', q: '', d: '' }; view.innerHTML = `<section class="wrap"><h2>Place an order</h2>${stepper()}<div id="wiz"></div></section>`; wiz(); };
const lineRows = o => o.lines.map(x => `<p><span>${esc(x.s.name)} × ${x.q}</span><span>${kes(x.s.price * x.q)}</span></p>`).join('');
function setPs(ps) { W.ps = ps; const p = $('#pill'), s = $('#stamp'); if (p) { p.className = 'pill ' + ps; p.textContent = PSL[ps]; } if (s) { s.className = 'stamp ' + ps; s.textContent = PSL[ps]; } }
function wiz() {
  $('.wsteps').outerHTML = stepper(); const w = $('#wiz');
  if (W.step === 1) {
    w.innerHTML = `<div class="split"><div><input class="search" id="oq" type="search" placeholder="Search items, e.g. duvet, printing, zip" aria-label="Search items" value="${esc(W.q)}">
      <div class="tabs"><button class="tab" data-f="" aria-selected="${!W.d}">All</button>${Object.entries(DEPTS).map(([k, d]) => `<button class="tab d-${k}" data-f="${k}" aria-selected="${W.d === k}">${d.e} ${d.n}</button>`).join('')}</div><div id="list"></div></div>
    <aside class="sum"><h3>Your order</h3><div id="sumList"></div><p class="tot">Total <strong id="tot"></strong></p><p class="estnote" id="fnote"></p><button class="btn full" id="next1">Continue</button></aside></div>`;
    const row = s => `<div class="row"><div><strong>${esc(s.name)}</strong><small>${priceTxt(s)}</small></div><div class="qty"><button type="button" data-d="${s.id}" aria-label="Less ${esc(s.name)}">−</button><input type="number" min="0" step="${stepOf(s)}" value="${cart[s.id] || 0}" data-q="${s.id}" aria-label="Quantity of ${esc(s.name)}"><button type="button" data-i="${s.id}" aria-label="More ${esc(s.name)}">+</button></div></div>`;
    const drawList = () => { const q = W.q.trim().toLowerCase(); let h = '';
      for (const [k, d] of Object.entries(DEPTS)) { if (W.d && W.d !== k) continue; const L = SERVICES.filter(s => s.dept === k && s.price > 0 && (!q || (s.name + ' ' + s.unit).toLowerCase().includes(q))); if (L.length) h += `<h3 class="d-${k}" style="color:var(--c);margin-top:1rem">${d.e} ${d.n}</h3>${L.map(row).join('')}`; }
      $('#list').innerHTML = h || '<p class="mute">No items match your search.</p>'; };
    const draw = () => { $('#sumList').innerHTML = items().map(x => `<p><span>${esc(x.s.name)} × ${x.q}</span><span>${kes(x.s.price * x.q)}</span></p>`).join('') || '<p class="mute">Nothing selected yet.</p>'; $('#tot').textContent = kes(total()); $('#next1').disabled = !total(); $('#fnote').textContent = hasFrom() ? 'Includes "from" items. These are starting prices; the final amount is confirmed when we see the item.' : ''; };
    drawList(); draw();
    $('#oq').oninput = e => { W.q = e.target.value; drawList(); };
    w.onclick = e => { const t = e.target;
      if (t.dataset.f !== undefined && t.classList.contains('tab')) { W.d = t.dataset.f; $$('.tab', w).forEach(b => b.setAttribute('aria-selected', b === t)); drawList(); return; }
      const id = t.dataset.i || t.dataset.d; if (!id) return; const s = SERVICES.find(x => x.id == id); cart[id] = snap(s, (cart[id] || 0) + (t.dataset.i ? 1 : -1) * stepOf(s)); if (!cart[id]) delete cart[id];
      saveCart(); $(`[data-q="${id}"]`).value = cart[id] || 0; draw(); };
    w.onchange = e => { const id = e.target.dataset.q; if (!id) return; const s = SERVICES.find(x => x.id == id), q = snap(s, Number(e.target.value)); q ? cart[id] = q : delete cart[id]; e.target.value = q; saveCart(); draw(); };
    $('#next1').onclick = () => { W.step = 2; wiz(); };
  } else if (W.step === 2) {
    const sv = JSON.parse(localStorage.getItem('ustawiDetails') || '{}');
    w.innerHTML = `<div class="split"><form id="det">
      ${field('Full name', 'name', `required autocomplete="name" value="${esc(sv.name)}"`)}${field('Phone number', 'phone', `required inputmode="tel" placeholder="07XX XXX XXX" autocomplete="tel" value="${esc(sv.phone)}"`)}
      ${field('Email (optional)', 'email', `type="email" value="${esc(sv.email)}"`)}${field('Preferred date', 'date', `type="date" min="${new Date().toISOString().slice(0, 10)}"`)}
      <label class="full">Collection method<select name="method"><option>I will drop off and collect</option><option>Please collect from me</option><option>Please deliver to me</option></select></label>
      <label class="full">Special instructions<textarea name="notes" rows="3" placeholder="Address for pickup/delivery, deadline, delicate items"></textarea></label>
      <p class="err" id="err" role="alert"></p><div class="full btnrow"><button type="button" class="btn ghost" id="back">Back</button><button class="btn">Continue to payment</button></div></form>
      <aside class="sum"><h3>Your order</h3>${items().map(x => `<p><span>${esc(x.s.name)} × ${x.q}</span><span>${kes(x.s.price * x.q)}</span></p>`).join('')}<p class="tot">Total <strong>${kes(total())}</strong></p>${hasFrom() ? '<p class="estnote">Includes "from" items: starting prices.</p>' : ''}</aside></div>`;
    $('#back').onclick = () => { W.step = 1; wiz(); };
    $('#det').onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = $('#det .btn:last-child'); $('#err').textContent = ''; btn.disabled = true;
      try {
        const lines = items(), r = await api('/api/orders', { method: 'POST', body: { ...f, items: lines.map(x => ({ service_id: x.s.id, qty: x.q })) } });
        localStorage.setItem('ustawiDetails', JSON.stringify({ name: f.name, phone: f.phone, email: f.email }));
        W.order = { ...r, phone: normPhone(f.phone), name: f.name, lines }; W.step = 3; W.msg = ''; W.ps = 'unpaid'; W.waiting = false; wiz();
      } catch (er) { $('#err').textContent = er.message; btn.disabled = false; }
    };
  } else if (W.step === 3) {
    const o = W.order, tabs = [['stk', 'M-Pesa prompt'], ['till', 'Pay to Till'], ['cash', 'Pay on collection']], amt = due(o);
    w.innerHTML = `<div class="split"><div>
      <div class="ordcard"><div><small>Your order number. Keep it to track your order.</small><p class="ref">${esc(o.ref)}</p><small>Payment status: <span class="pill ${W.ps}" id="pill">${PSL[W.ps]}</span></small></div>
        <div class="btnrow" style="margin:0"><button class="btn small" id="cp" type="button">Copy number</button><button class="btn small" id="rc" type="button">Download receipt</button></div></div>
      <p>Choose how to pay <strong>${kes(amt)}</strong>.</p>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="tab" data-m="${k}" aria-selected="${W.mode === k}">${n}</button>`).join('')}</div><div class="paybox" id="paybox"></div><p id="pmsg" class="pmsg" aria-live="polite">${esc(W.msg)}</p></div>
      <aside class="sum rcpt"><span class="stamp ${W.ps}" id="stamp">${PSL[W.ps]}</span><h3>Receipt</h3><p class="mute" style="display:block;margin:0 0 .6rem">Order ${esc(o.ref)}</p>${lineRows(o)}<p class="tot">${amt < o.total ? 'Balance due' : 'Total'} <strong>${kes(amt)}</strong></p>
        ${o.hasFrom ? '<p class="estnote">Includes "from" items: starting prices.</p>' : ''}<a class="btn ghost full" href="#/track/${encodeURIComponent(o.ref)}">Track this order</a></aside></div>`;
    $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(o.ref); toast('Order number copied'); } catch { toast('Order number: ' + o.ref); } };
    $('#rc').onclick = () => download(o.ref, o.phone);
    $$('[data-m]').forEach(b => b.onclick = () => { W.mode = b.dataset.m; wiz(); });
    const pb = $('#paybox'), msg = (t, bad, spin) => { W.msg = t; const p = $('#pmsg'); p.innerHTML = (spin ? '<span class="spin"></span>' : '') + esc(t); p.className = 'pmsg' + (bad ? ' bad' : ''); };
    if (W.waiting) msg(W.msg, false, true);
    if (W.mode === 'stk') {
      pb.innerHTML = `<p>We send a payment request to your phone. Enter your M-Pesa PIN to approve it.</p><label>M-Pesa number<input id="mp" inputmode="tel" value="0${o.phone.slice(3)}"></label><button class="btn" id="sendStk">Pay ${kes(amt)} with M-Pesa prompt</button>`;
      $('#sendStk').onclick = async e => { const b = e.target; b.disabled = true; msg('Sending the prompt…', false, true);
        try { await api(`/api/orders/${encodeURIComponent(o.ref)}/pay/stk`, { method: 'POST', body: { phone: o.phone, mpesaPhone: $('#mp').value } }); W.waiting = true; msg('Prompt sent. Check your phone and enter your M-Pesa PIN. This page updates when the payment is confirmed.', false, true); poll(); }
        catch (er) { msg(er.message, true); } setTimeout(() => b.disabled = false, 8000); };
    } else if (W.mode === 'till') {
      pb.innerHTML = `<ol class="how"><li>Open M-Pesa, choose <strong>Lipa na M-Pesa → Buy Goods and Services</strong>.</li><li>Till number: <strong class="big">${esc(CFG.till)}</strong></li><li>Amount: <strong class="big">${kes(amt)}</strong></li><li>Paste the M-Pesa confirmation message below.</li></ol>
        <label>M-Pesa message<textarea id="mm" rows="3" placeholder="Paste the full message, e.g. SHK7A1B2C3 Confirmed. Ksh..."></textarea></label><button class="btn" id="sendMsg">Submit payment message</button>
        <p class="mute">Your order is marked PAID only after we verify the payment on our M-Pesa records.</p>`;
      $('#sendMsg').onclick = async () => { try { await api(`/api/orders/${encodeURIComponent(o.ref)}/pay/manual`, { method: 'POST', body: { phone: o.phone, message: $('#mm').value } }); setPs('awaiting'); W.waiting = true; msg('Message received. We are verifying your payment. This page updates once it is confirmed.', false, true); poll(); } catch (e) { msg(e.message, true); } };
    } else {
      pb.innerHTML = `<p>Pay in cash when you collect, or pay later from <strong>Track order</strong> using your order number <strong>${esc(o.ref)}</strong>. Your receipt will show UNPAID until we receive payment.</p><button class="btn" id="fin">Finish</button>`;
      $('#fin').onclick = () => { cart = {}; saveCart(); W.step = 4; W.paid = false; wiz(); };
    }
  } else {
    const o = W.order; clearInterval(timer);
    w.innerHTML = `<div class="donebox reveal in">${W.paid ? '<svg class="tick" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="36"/><path d="M24 41l12 12 21-24"/></svg>' : ''}<h3>${W.paid ? 'Payment confirmed' : 'Order received'}</h3><p class="ref">${esc(o.ref)}</p>
      <p><span class="pill ${W.paid ? 'paid' : W.ps}">${W.paid ? 'PAID' : PSL[W.ps]}</span></p>
      <p>${W.paid ? `We received your payment. Thank you, ${esc(o.name)}.` : 'We will contact you on ' + esc('0' + o.phone.slice(3)) + '. You can pay on collection or from Track order.'}</p>
      <div class="btnrow"><button class="btn" id="rcpt">Download receipt (PDF)</button><a class="btn ghost" href="#/track/${encodeURIComponent(o.ref)}">Track this order</a><a class="btn ghost" href="${wa('Hello Ustawi, my order is ' + o.ref)}" target="_blank" rel="noopener">WhatsApp us</a></div></div>`;
    $('#rcpt').onclick = () => download(o.ref, o.phone);
  }
}
function poll() {
  clearInterval(timer); let n = 0;
  timer = setInterval(async () => {
    if (++n > 75 || !W.order) { clearInterval(timer); W.waiting = false; return; }
    try {
      const d = await api(`/api/orders/${encodeURIComponent(W.order.ref)}/pay-status?phone=${W.order.phone}`);
      if (d.pay_status === 'paid') { clearInterval(timer); W.waiting = false; cart = {}; saveCart(); W.step = 4; W.paid = true; W.ps = 'paid'; if (location.hash.startsWith('#/order')) wiz(); else toast('Payment confirmed. Thank you!'); }
      else if (d.last === 'failed' && $('#pmsg')) { clearInterval(timer); W.waiting = false; W.msg = 'The payment was not completed. You can try again.'; $('#pmsg').textContent = W.msg; $('#pmsg').className = 'pmsg bad'; }
      else if (['partial', 'awaiting'].includes(d.pay_status)) setPs(d.pay_status);
    } catch {}
  }, 4000);
}

pages.track = (arg) => {
  const sv = JSON.parse(localStorage.getItem('ustawiDetails') || '{}');
  view.innerHTML = `<section class="wrap"><h2>Track your order</h2><p class="sub">Enter your order number and the phone number you ordered with. Your order number is on your receipt.</p>
  <form class="inline" id="tf"><input name="ref" placeholder="Order number e.g. USW-261023-AB12" required aria-label="Order number" value="${esc(arg ? decodeURIComponent(arg) : '')}"><input name="phone" placeholder="Phone number" required inputmode="tel" aria-label="Phone" value="${esc(sv.phone)}"><button class="btn">Check status</button></form><div id="tout" aria-live="polite"></div></section>`;
  $('#tf').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), out = $('#tout'), ph = normPhone(f.phone);
    try {
      const o = await api(`/api/orders/${encodeURIComponent(f.ref.trim())}?phone=${ph}`), ST = ['Pending', 'Confirmed', 'In Progress', 'Ready for Collection', 'Out for Delivery', 'Completed'], i = ST.indexOf(o.status);
      out.innerHTML = `<div class="donebox rcpt reveal in"><span class="stamp ${o.pay_status}">${PSL[o.pay_status]}</span><p class="ref">${esc(o.ref)}</p><p>${o.items.map(x => `${esc(x.name)} × ${x.qty}`).join(', ')}</p>
        ${o.status === 'Cancelled' ? '<p class="err">This order was cancelled.</p>' : `<ul class="status">${ST.map((s, k) => `<li class="${k === i ? 'on' : k < i ? 'past' : ''}">${s}</li>`).join('')}</ul>`}
        <p>Total ${kes(o.total)} · Paid ${kes(o.paid)} · Balance ${kes(Math.max(0, o.total - o.paid))}</p>
        <div class="btnrow"><button class="btn" id="rc">Download receipt (PDF)</button>${o.pay_status !== 'paid' && o.status !== 'Cancelled' ? '<button class="btn ghost" id="pn">Pay now</button>' : ''}</div></div>`;
      $('#rc').onclick = () => download(o.ref, ph);
      if ($('#pn')) $('#pn').onclick = () => { W = { step: 3, mode: 'stk', msg: '', ps: o.pay_status, q: '', d: '', order: { ref: o.ref, phone: ph, name: o.name, total: o.total, due: Math.max(1, o.total - o.paid), lines: o.items.map(x => ({ s: { name: x.name, price: x.price }, q: x.qty })) } }; location.hash = '#/order'; };
    } catch (er) { out.innerHTML = `<p class="err">${esc(er.message)}</p>`; }
  };
  if (arg && sv.phone) $('#tf').requestSubmit();
};

pages.account = async () => {
  const stmt = async () => {
    try {
      const { user, orders } = await api('/api/me'); const billed = orders.reduce((a, o) => a + o.total, 0), paid = orders.reduce((a, o) => a + o.paid, 0);
      view.innerHTML = `<section class="wrap" id="statement"><div class="deptimg"><div><h2>Hello, ${esc(user.name.split(' ')[0])}</h2><p class="sub">Your booking statement for ${esc('0' + user.phone.slice(3))}</p></div></div>
      <div class="cards3"><div class="stat"><small>Orders</small><strong>${orders.length}</strong></div><div class="stat"><small>Billed</small><strong>${kes(billed)}</strong></div><div class="stat"><small>Paid</small><strong>${kes(paid)}</strong></div><div class="stat"><small>Balance</small><strong>${kes(Math.max(0, billed - paid))}</strong></div></div>
      <div class="table-wrap"><table><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>${orders.map(o => `<tr><td>${o.ref}</td><td>${o.created.slice(0, 10)}</td><td>${kes(o.total)}</td><td>${kes(o.paid)}</td><td>${o.status} <span class="pill ${o.pay_status}">${PSL[o.pay_status]}</span></td><td><button class="btn small" data-r="${o.ref}">Receipt</button> <a class="btn small ghost" href="#/track/${o.ref}">Track</a></td></tr>`).join('') || '<tr><td colspan="6">No orders yet. <a href="#/order">Place your first order</a>.</td></tr>'}</tbody></table></div>
      <div class="btnrow noprint"><a class="btn" href="#/order">New order</a><button class="btn ghost" onclick="print()">Print / save statement</button><button class="btn ghost" id="out">Log out</button></div></section>`;
      $$('[data-r]').forEach(b => b.onclick = () => download(b.dataset.r, user.phone)); $('#out').onclick = () => { token = ''; localStorage.removeItem('ustawiToken'); nav(); route(); };
      if (['admin', 'staff'].includes(user.role)) $('#statement').insertAdjacentHTML('afterbegin', '<p class="note">You are signed in as staff. <a href="/admin">Open the admin dashboard</a>.</p>');
      return true;
    } catch { token = ''; localStorage.removeItem('ustawiToken'); return false; }
  };
  if (token && await stmt()) return;
  view.innerHTML = `<section class="wrap narrow"><h2>My account</h2><p class="sub">Regular customers get a statement of every booking and payment.</p>
  <div class="tabs"><button class="tab" data-t="login" aria-selected="true">Log in</button><button class="tab" data-t="reg" aria-selected="false">Create account</button></div>
  <form id="af"><div id="regf" hidden>${field('Full name', 'name', 'autocomplete="name"')}${field('Email (optional)', 'email', 'type="email"')}</div>
  ${field('Phone number', 'phone', 'required inputmode="tel" autocomplete="tel"')}${field('Password', 'password', 'type="password" required minlength="8" autocomplete="current-password"')}<p class="err" id="err" role="alert"></p><button class="btn full">Log in</button></form></section>`;
  let mode = 'login';
  $$('[data-t]').forEach(b => b.onclick = () => { mode = b.dataset.t; $$('[data-t]').forEach(x => x.setAttribute('aria-selected', x === b)); $('#regf').hidden = mode === 'login'; $('#af .btn').textContent = mode === 'login' ? 'Log in' : 'Create account'; });
  $('#af').onsubmit = async e => {
    e.preventDefault(); try { const r = await api('/api/auth/' + (mode === 'login' ? 'login' : 'register'), { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); token = r.token; localStorage.setItem('ustawiToken', token); nav(); route(); }
    catch (er) { $('#err').textContent = er.message; }
  };
};

pages.about = () => view.innerHTML = `<section class="wrap"><h2>About Ustawi</h2><div class="split"><div><p class="lead">Ustawi Laundry and Computer Services brings four everyday services under one roof: laundry, computer services, stationery and tailoring.</p>
<p>Our promise is simple: <strong>Your Satisfaction, Our Priority</strong>. We look after your garments, prepare your documents, supply your school and office needs, and repair or tailor your clothes, with clear prices and clear order tracking.</p>
<p>You can order online, pay with M-Pesa, and keep a statement of your bookings in your own account.</p><a class="btn" href="#/order">Order now</a></div>${img('Hero', 'Inside Ustawi', 'side')}</div></section>`;
const FAQ = [['How do I pay?', `Choose an M-Pesa prompt to your phone, or pay to Till {till} and paste your M-Pesa message, or pay in cash when you collect. An order shows as PAID only after the payment is verified.`],
  ['How do I get my receipt?', 'As soon as you place an order you can download a receipt with your order number. It shows UNPAID until your payment is confirmed, then PAID. You can download it again from Track order or your account.'],
  ['How do I track my order?', 'Open Track order and enter your order number and phone number. The order number is on your receipt.'],
  ['What does “from” mean next to a price?', 'It is a starting price. The final amount depends on the item (for example size or fabric) and is confirmed when we see it.'],
  ['Do you collect and deliver?', 'Yes, on request. Choose collection or delivery when you order and add your address in the instructions. Delivery starts from KSh 100.'],
  ['Can I get express service?', 'Yes. Tell us your deadline in the special instructions or on WhatsApp.'],
  ['I paid but my order is not marked paid.', 'Till payments are checked by our team. Contact us with your order number if it takes long.'],
  ['What is a booking statement?', 'It is the list of all your orders and payments in your account, with totals and any balance.']];
pages.faq = () => view.innerHTML = `<section class="wrap narrow"><h2>Frequently asked questions</h2>${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a.replace('{till}', esc(CFG.till))}</p></details>`).join('')}</section>`;
pages.contact = () => {
  view.innerHTML = `<section class="wrap"><h2>Contact &amp; location</h2><div class="split"><div class="contact">
  <p>📞 ${CFG.phone ? `<a href="tel:${esc(CFG.phone)}">${esc(CFG.phone)}</a>` : 'Phone not added yet'}</p><p>💬 <a href="${wa('Hello Ustawi, I have a question.')}" target="_blank" rel="noopener">WhatsApp us</a></p>
  <p>✉️ ${CFG.email ? `<a href="mailto:${esc(CFG.email)}">${esc(CFG.email)}</a>` : 'Email not added yet'}</p><p>📍 ${esc(CFG.location) || 'Location not added yet'}</p><p>🕒 ${esc(CFG.hours) || 'Business hours not added yet'}</p><p>💳 M-Pesa Till <strong>${esc(CFG.till)}</strong></p>
  <form id="cf"><label>Your message<textarea name="m" rows="3" required></textarea></label><button class="btn">Send on WhatsApp</button></form></div>${mapEmbed(380)}</div></section>`;
  $('#cf').onsubmit = e => { e.preventDefault(); window.open(wa(new FormData(e.target).get('m')), '_blank'); };
};

/* ---------------- router with sliding page transitions ---------------- */
const ORDER = ['home', 'services', 'track', 'about', 'faq', 'contact', 'account', 'order'];
let prevPage = null;
function nav() { $('#navAcc').textContent = token ? 'My account' : 'Log in'; }
async function route() {
  const my = ++rid; clearInterval(timer); clearInterval(sliderT);
  const [p, arg] = (location.hash.slice(2) || 'home').split('/'), name = pages[p] ? p : 'home', bar = $('#bar');
  bar.style.opacity = 1; bar.style.width = '65%';
  if (['home', 'services', 'order'].includes(name) && Date.now() - lastFetch > 8000) await refreshServices();
  if (my !== rid) return;
  $$('#menu a').forEach(a => a.classList.toggle('active', a.dataset.p === name)); $('#menu').classList.remove('open'); $('#burger').setAttribute('aria-expanded', false);
  const dir = prevPage && prevPage !== name ? Math.sign(ORDER.indexOf(name) - ORDER.indexOf(prevPage)) : 0;
  if (prevPage !== null && !reduce && dir) { // old page slides out while the new one slides in
    const g = view.cloneNode(true); g.removeAttribute('id'); g.className = 'view ghost ' + (dir > 0 ? 'out-left' : 'out-right'); g.setAttribute('aria-hidden', 'true');
    $$('[id]', g).forEach(e => e.removeAttribute('id')); $$('iframe', g).forEach(f => f.replaceWith(document.createElement('div'))); stage.appendChild(g); setTimeout(() => g.remove(), 520);
  }
  view.innerHTML = ''; view.className = 'view'; void view.offsetWidth; view.className = 'view ' + (reduce ? '' : dir > 0 ? 'from-right' : dir < 0 ? 'from-left' : 'fade');
  window.scrollTo(0, 0); prevPage = name; document.title = 'Ustawi · ' + name[0].toUpperCase() + name.slice(1);
  await pages[name](arg); if (my !== rid) return;
  if (name === 'order' && W.step === 3 && W.waiting) poll();
  reveal(); bar.style.width = '100%'; setTimeout(() => { bar.style.opacity = 0; bar.style.width = '0'; }, 350);
}
$('#burger').onclick = () => { const o = $('#menu').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); };
const toTop = $('#toTop'); toTop.onclick = () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
addEventListener('scroll', () => { toTop.hidden = scrollY < 600; }, { passive: true });
window.addEventListener('hashchange', route);
(async () => {
  $('#yr').textContent = new Date().getFullYear();
  try { [CFG, SERVICES] = await Promise.all([api('/api/config'), api('/api/services')]); lastFetch = Date.now(); } catch { view.innerHTML = '<section class="wrap"><h2>Service unavailable</h2><p>Please try again shortly.</p></section>'; return; }
  $('#fName').textContent = CFG.name; $('#fTill').textContent = CFG.till; $('#waFloat').href = wa('Hello Ustawi, I would like to enquire about your services.');
  $('#fContact').innerHTML = [CFG.phone && `📞 ${esc(CFG.phone)}`, CFG.email && `✉️ ${esc(CFG.email)}`, CFG.location && `📍 ${esc(CFG.location)}`].filter(Boolean).join('<br>');
  saveCart(); nav(); route();
})();