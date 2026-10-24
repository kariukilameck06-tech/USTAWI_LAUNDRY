const path = require('path'), dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const express = require('express'), { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), rateLimit = require('express-rate-limit'), PDF = require('pdfkit');
const M = require('./mpesa.config'), DEFAULT_PRICES = require('./prices');
const E = process.env, PORT = E.PORT || 3000, TILL = M.till, BIZ = E.BUSINESS_NAME || 'Ustawi Laundry and Computer Services';
if (!E.JWT_SECRET || E.JWT_SECRET.length < 24) { console.error('Set JWT_SECRET (24+ random characters) in .env'); process.exit(1); }

const db = new DatabaseSync(E.DB_FILE || 'ustawi.db');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT UNIQUE NOT NULL,email TEXT,hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY,dept TEXT NOT NULL,name TEXT NOT NULL,unit TEXT NOT NULL,price REAL NOT NULL DEFAULT 0,active INTEGER DEFAULT 1,from_price INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,ref TEXT UNIQUE NOT NULL,user_id INTEGER REFERENCES users(id),name TEXT,phone TEXT,email TEXT,method TEXT,pref_date TEXT,notes TEXT,total REAL NOT NULL,status TEXT DEFAULT 'Pending',pay_status TEXT DEFAULT 'unpaid',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),service_id INTEGER,dept TEXT,name TEXT,unit TEXT,price REAL,qty REAL,from_price INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),method TEXT,amount REAL,mpesa_code TEXT UNIQUE,raw TEXT,status TEXT,checkout_id TEXT,verified_by TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_o_user ON orders(user_id);CREATE INDEX IF NOT EXISTS ix_o_phone ON orders(phone);CREATE INDEX IF NOT EXISTS ix_p_order ON payments(order_id);`);
// upgrade databases created by the first version
for (const q of ['ALTER TABLE services ADD COLUMN from_price INTEGER DEFAULT 0', 'ALTER TABLE order_items ADD COLUMN from_price INTEGER DEFAULT 0']) { try { db.exec(q); } catch {} }

const insSvc = db.prepare('INSERT INTO services(dept,name,unit,price,from_price) VALUES(?,?,?,?,?)');
function loadDefaults() { // adds only items that are missing (same department + name); never overwrites admin prices
  let n = 0; for (const p of DEFAULT_PRICES) if (!db.prepare('SELECT 1 FROM services WHERE dept=? AND lower(name)=lower(?)').get(p.dept, p.name)) { insSvc.run(p.dept, p.name, p.unit, p.price, p.from ? 1 : 0); n++; } return n;
}
if (!db.prepare('SELECT COUNT(*) c FROM services').get().c && E.SEED_SAMPLE_PRICES !== 'false') console.log(`Loaded ${loadDefaults()} services from the Ustawi price list. Change prices any time in /admin.`);
if (E.ADMIN_PHONE && E.ADMIN_PASSWORD && !db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
  if (E.ADMIN_PASSWORD.length < 10) console.error('ADMIN_PASSWORD must be at least 10 characters. Admin not created.');
  else { db.prepare("INSERT INTO users(name,phone,hash,role) VALUES(?,?,?,'admin')").run(E.ADMIN_NAME || 'Owner', phoneN(E.ADMIN_PHONE), bcrypt.hashSync(E.ADMIN_PASSWORD, 12)); console.log('Admin account created.'); }
}

function phoneN(p) { p = String(p || '').replace(/\D/g, ''); if (p.startsWith('254')) return p; if (p.startsWith('0')) return '254' + p.slice(1); if (p.length === 9) return '254' + p; return p; }
const validPhone = p => /^254[17]\d{8}$/.test(p);
const S = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const A = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(e => { console.error(e); res.status(500).json({ error: 'Server error. Please try again.' }); });
const makeRef = () => 'USW-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
const sign = u => jwt.sign({ id: u.id, role: u.role }, E.JWT_SECRET, { expiresIn: '7d' });
const optAuth = (req, _res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').slice(7), E.JWT_SECRET); } catch {} next(); };
const needAuth = (req, res, next) => optAuth(req, res, () => req.user ? next() : res.status(401).json({ error: 'Please log in.' }));
const needStaff = (req, res, next) => needAuth(req, res, () => ['admin', 'staff'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed.' }));
const needAdmin = (req, res, next) => needAuth(req, res, () => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only.' }));
const STATUSES = ['Pending', 'Confirmed', 'In Progress', 'Ready for Collection', 'Out for Delivery', 'Completed', 'Cancelled'];
const DEPTS = ['laundry', 'computer', 'stationery', 'tailoring'];
const paidSum = id => db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE order_id=? AND status='verified'").get(id).s;
const round2 = n => Math.round(n * 100) / 100;

function recalc(oid) {
  const o = db.prepare('SELECT total FROM orders WHERE id=?').get(oid), paid = paidSum(oid);
  const aw = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_id=? AND status='awaiting_verification'").get(oid).c;
  const st = paid >= o.total ? 'paid' : paid > 0 ? 'partial' : aw ? 'awaiting' : 'unpaid';
  db.prepare('UPDATE orders SET pay_status=? WHERE id=?').run(st, oid);
  if (st === 'paid') db.prepare("UPDATE orders SET status='Confirmed' WHERE id=? AND status='Pending'").run(oid);
  return st;
}
function orderFor(ref, phone) {
  const o = db.prepare('SELECT * FROM orders WHERE ref=?').get(S(ref, 40).toUpperCase());
  if (!o || o.phone !== phoneN(phone)) return null;
  return o;
}
const full = o => ({ ...o, paid: paidSum(o.id), items: db.prepare('SELECT name,unit,price,qty,dept,from_price FROM order_items WHERE order_id=?').all(o.id),
  payments: db.prepare('SELECT method,amount,mpesa_code,status,created FROM payments WHERE order_id=? ORDER BY id DESC').all(o.id) });

const app = express();
app.disable('x-powered-by');
app.use((_q, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' }); next(); });
app.use(express.json({ limit: '50kb' }));
const lim = rateLimit({ windowMs: 15 * 60e3, limit: 60, standardHeaders: true, legacyHeaders: false });
const pollLim = rateLimit({ windowMs: 15 * 60e3, limit: 400, standardHeaders: true, legacyHeaders: false });

const stkReady = () => !!(M.consumerKey && M.consumerSecret && M.shortcode && M.passkey && M.publicUrl);
app.get('/api/config', (_q, res) => res.json({ name: BIZ, phone: E.BUSINESS_PHONE || '', whatsapp: E.BUSINESS_WHATSAPP || '', email: E.BUSINESS_EMAIL || '', location: E.BUSINESS_LOCATION || '', hours: E.BUSINESS_HOURS || '', mapQuery: E.BUSINESS_MAP_QUERY || '', till: TILL, stk: stkReady() }));
app.get('/api/services', (_q, res) => { res.set('Cache-Control', 'no-store'); res.json(db.prepare('SELECT id,dept,name,unit,price,from_price FROM services WHERE active=1 ORDER BY dept,id').all()); });

/* ---------- accounts ---------- */
app.post('/api/auth/register', lim, A((req, res) => {
  const b = req.body || {}, phone = phoneN(b.phone);
  if (!S(b.name) || !validPhone(phone) || S(b.password, 100).length < 8) return res.status(400).json({ error: 'Enter your name, a valid phone number and a password of 8+ characters.' });
  if (db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone)) return res.status(409).json({ error: 'An account with this phone already exists. Please log in.' });
  const r = db.prepare("INSERT INTO users(name,phone,email,hash) VALUES(?,?,?,?)").run(S(b.name), phone, S(b.email), bcrypt.hashSync(S(b.password, 100), 12));
  res.json({ token: sign({ id: Number(r.lastInsertRowid), role: 'customer' }) });
}));
app.post('/api/auth/login', lim, A((req, res) => {
  const b = req.body || {}, u = db.prepare('SELECT * FROM users WHERE phone=?').get(phoneN(b.phone));
  if (!u || !bcrypt.compareSync(S(b.password, 100), u.hash)) return res.status(401).json({ error: 'Wrong phone number or password.' });
  res.json({ token: sign(u), role: u.role, name: u.name });
}));
app.get('/api/me', needAuth, A((req, res) => {
  const u = db.prepare('SELECT id,name,phone,email,role FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(401).json({ error: 'Please log in.' });
  const orders = db.prepare(`SELECT o.ref,o.created,o.total,o.status,o.pay_status,COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id=o.id AND p.status='verified'),0) paid FROM orders o WHERE o.user_id=? ORDER BY o.id DESC`).all(u.id);
  res.json({ user: u, orders });
}));

/* ---------- orders (prices are always re-read from the database, so admin price changes apply instantly) ---------- */
app.post('/api/orders', lim, optAuth, A((req, res) => {
  const b = req.body || {}, phone = phoneN(b.phone), items = Array.isArray(b.items) ? b.items : [];
  if (!S(b.name) || !validPhone(phone)) return res.status(400).json({ error: 'Enter your name and a valid Safaricom phone number.' });
  if (!items.length || items.length > 80) return res.status(400).json({ error: 'Choose at least one service.' });
  let total = 0, hasFrom = false; const rows = [];
  for (const it of items) {
    const s = db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(Number(it.service_id)), q = Number(it.qty), kg = s && /kg/i.test(s.unit);
    if (!s || !(q > 0) || q > 1000 || !(s.price > 0) || (kg ? (q * 2) % 1 !== 0 : q % 1 !== 0)) return res.status(400).json({ error: 'An item is unavailable or its quantity is invalid. Please refresh and try again.' });
    total += s.price * q; hasFrom = hasFrom || !!s.from_price; rows.push([s, q]);
  }
  total = round2(total);
  let ref; do { ref = makeRef(); } while (db.prepare('SELECT 1 FROM orders WHERE ref=?').get(ref));
  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO orders(ref,user_id,name,phone,email,method,pref_date,notes,total) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(ref, req.user?.id || null, S(b.name), phone, S(b.email), S(b.method, 60), S(b.date, 20), S(b.notes, 500), total);
    const ins = db.prepare('INSERT INTO order_items(order_id,service_id,dept,name,unit,price,qty,from_price) VALUES(?,?,?,?,?,?,?,?)');
    rows.forEach(([s, q]) => ins.run(Number(r.lastInsertRowid), s.id, s.dept, s.name, s.unit, s.price, q, s.from_price));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ref, total, hasFrom });
}));
app.get('/api/orders/:ref', lim, A((req, res) => {
  const o = orderFor(req.params.ref, req.query.phone);
  o ? res.json(full(o)) : res.status(404).json({ error: 'No order found. Check the order number and phone number.' });
}));

/* ---------- M-Pesa STK push (Safaricom Daraja) ---------- */
const dBase = () => M.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
const nairobiTs = () => new Date(Date.now() + 3 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 14);
async function darajaToken() {
  const t = await fetch(dBase() + '/oauth/v1/generate?grant_type=client_credentials', { headers: { Authorization: 'Basic ' + Buffer.from(M.consumerKey + ':' + M.consumerSecret).toString('base64') } }).then(r => r.json()).catch(() => ({}));
  if (!t.access_token) throw new Error('Could not authenticate with M-Pesa. Check the Consumer Key and Secret.');
  return t.access_token;
}
async function stkPush(phone, amount, ref) {
  const token = await darajaToken(), ts = nairobiTs();
  const r = await fetch(dBase() + '/mpesa/stkpush/v1/processrequest', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: M.shortcode, Password: Buffer.from(M.shortcode + M.passkey + ts).toString('base64'), Timestamp: ts,
      TransactionType: M.txType, Amount: amount, PartyA: phone, PartyB: M.txType === 'CustomerPayBillOnline' ? M.shortcode : TILL, PhoneNumber: phone,
      CallBackURL: `${M.publicUrl.replace(/\/$/, '')}/api/mpesa/callback/${M.callbackSecret}`, AccountReference: ref.slice(0, 12), TransactionDesc: 'Ustawi ' + ref }) }).then(r => r.json());
  if (String(r.ResponseCode) !== '0') throw new Error(r.errorMessage || r.CustomerMessage || 'M-Pesa rejected the request.');
  return r.CheckoutRequestID;
}
async function stkQuery(checkoutId) { // asks Safaricom for the result when the callback has not arrived (e.g. testing on localhost)
  const token = await darajaToken(), ts = nairobiTs();
  return fetch(dBase() + '/mpesa/stkpushquery/v1/query', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: M.shortcode, Password: Buffer.from(M.shortcode + M.passkey + ts).toString('base64'), Timestamp: ts, CheckoutRequestID: checkoutId }) }).then(r => r.json());
}
const lastChk = new Map();
async function checkStk(p) {
  if (!stkReady() || !p || p.status !== 'pending' || !p.checkout_id || p.method !== 'mpesa_stk') return;
  if (Date.now() - new Date(p.created.replace(' ', 'T') + 'Z') < 15000 || Date.now() - (lastChk.get(p.id) || 0) < 10000) return;
  lastChk.set(p.id, Date.now());
  try {
    const r = await stkQuery(p.checkout_id); if (r.ResultCode === undefined) return; // still being processed
    if (String(r.ResultCode) === '0') db.prepare("UPDATE payments SET status='verified',verified_by='daraja-query' WHERE id=? AND status='pending'").run(p.id);
    else db.prepare("UPDATE payments SET status='failed',raw=? WHERE id=? AND status='pending'").run(S(r.ResultDesc, 200), p.id);
    recalc(p.order_id);
  } catch (e) { console.error('STK query failed:', e.message); }
}
app.post('/api/orders/:ref/pay/stk', lim, A(async (req, res) => {
  const o = orderFor(req.params.ref, req.body?.phone); if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (!stkReady()) return res.status(501).json({ error: 'The M-Pesa prompt is not switched on yet. Please pay to the Till and submit your M-Pesa message.' });
  const bal = Math.ceil(o.total - paidSum(o.id)); if (bal < 1) return res.status(400).json({ error: 'This order is already paid.' });
  const mp = phoneN(req.body?.mpesaPhone || o.phone); if (!validPhone(mp)) return res.status(400).json({ error: 'Enter a valid Safaricom number.' });
  const recent = db.prepare("SELECT created FROM payments WHERE order_id=? AND method='mpesa_stk' AND status='pending' ORDER BY id DESC").get(o.id);
  if (recent && Date.now() - new Date(recent.created.replace(' ', 'T') + 'Z') < 45000) return res.status(429).json({ error: 'A prompt was just sent. Please wait a moment and check your phone.' });
  try {
    const id = await stkPush(mp, bal, o.ref);
    db.prepare("INSERT INTO payments(order_id,method,amount,status,checkout_id) VALUES(?,?,?,?,?)").run(o.id, 'mpesa_stk', bal, 'pending', id);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: e.message }); }
}));
app.post('/api/mpesa/callback/:secret', express.json(), A((req, res) => {
  const ok = () => res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  if (!M.callbackSecret || req.params.secret !== M.callbackSecret) return res.status(403).end();
  const cb = req.body?.Body?.stkCallback; if (!cb) return ok();
  const p = db.prepare("SELECT * FROM payments WHERE checkout_id=? AND status IN ('pending','verified')").get(S(cb.CheckoutRequestID, 100)); if (!p) return ok();
  if (cb.ResultCode === 0) {
    const m = Object.fromEntries((cb.CallbackMetadata?.Item || []).map(i => [i.Name, i.Value])), code = S(m.MpesaReceiptNumber, 20);
    if (code && !db.prepare('SELECT 1 FROM payments WHERE mpesa_code=?').get(code))
      db.prepare("UPDATE payments SET status='verified',amount=?,mpesa_code=?,verified_by='daraja' WHERE id=?").run(Number(m.Amount) || p.amount, code, p.id);
  } else if (p.status === 'pending') db.prepare("UPDATE payments SET status='failed',raw=? WHERE id=?").run(S(cb.ResultDesc, 200), p.id);
  recalc(p.order_id); ok();
}));
app.get('/api/orders/:ref/pay-status', pollLim, A(async (req, res) => {
  const o = orderFor(req.params.ref, req.query.phone); if (!o) return res.status(404).json({ error: 'Not found.' });
  const lastP = () => db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY id DESC').get(o.id);
  await checkStk(lastP());
  const cur = db.prepare('SELECT pay_status FROM orders WHERE id=?').get(o.id).pay_status;
  res.json({ pay_status: cur, last: lastP()?.status || null, paid: paidSum(o.id) });
}));
app.post('/api/orders/:ref/pay/manual', lim, A((req, res) => {
  const o = orderFor(req.params.ref, req.body?.phone); if (!o) return res.status(404).json({ error: 'Order not found.' });
  const msg = S(req.body?.message, 600).toUpperCase(), code = (msg.match(/\b[A-Z][A-Z0-9]{9}\b/) || [])[0], amt = (msg.match(/KSH\.?\s?([\d,]+(?:\.\d+)?)/) || [])[1];
  if (!code) return res.status(400).json({ error: 'We could not find the M-Pesa transaction code. Paste the full M-Pesa message.' });
  if (db.prepare('SELECT 1 FROM payments WHERE mpesa_code=?').get(code)) return res.status(409).json({ error: 'This transaction code has already been submitted.' });
  db.prepare("INSERT INTO payments(order_id,method,amount,mpesa_code,raw,status) VALUES(?,?,?,?,?,'awaiting_verification')").run(o.id, 'mpesa_till', amt ? Number(amt.replace(/,/g, '')) : null, code, msg);
  recalc(o.id); res.json({ ok: true });
}));

/* ---------- receipt (available as soon as the order exists; shows PAID / UNPAID) ---------- */
function sendReceipt(res, o) {
  const f = full(o), bal = Math.max(0, round2(o.total - f.paid));
  const ST = { paid: ['PAID', '#0c8c80'], partial: ['PART PAID', '#c77d00'], awaiting: ['PAYMENT PENDING', '#c77d00'], unpaid: ['UNPAID', '#b3261e'] }[o.pay_status] || ['UNPAID', '#b3261e'];
  const d = new PDF({ size: 'A5', margin: 30 }), L = 30, W = d.page.width - 60, kes = n => 'KSh ' + Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="Receipt-${o.ref}.pdf"`); d.pipe(res);
  d.rect(0, 0, d.page.width, 74).fill('#0a2a5c');
  d.fillColor('#fff').font('Helvetica-Bold').fontSize(14).text(BIZ, L, 18, { width: W });
  d.font('Helvetica').fontSize(8).fillColor('#bfe9e4').text('Your Satisfaction, Our Priority' + (E.BUSINESS_PHONE ? '   |   ' + E.BUSINESS_PHONE : ''), L, 52, { width: W });
  d.fillColor('#0a2a5c').font('Helvetica-Bold').fontSize(11).text('ORDER RECEIPT', L, 88);
  d.fontSize(18).text(o.ref, L, 103);
  d.save().rotate(-8, { origin: [L + W - 60, 108] }); d.roundedRect(L + W - 120, 90, 120, 32, 6).lineWidth(2.5).stroke(ST[1]);
  d.fillColor(ST[1]).fontSize(ST[0].length > 9 ? 10 : 15).text(ST[0], L + W - 120, ST[0].length > 9 ? 101 : 97, { width: 120, align: 'center' }); d.restore();
  d.font('Helvetica').fontSize(9).fillColor('#333');
  let y = 134; const kv = (k, v) => { d.font('Helvetica-Bold').text(k, L, y, { continued: true }).font('Helvetica').text('  ' + v); y = d.y + 2; };
  kv('Date:', new Date(o.created.replace(' ', 'T') + 'Z').toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }));
  kv('Customer:', `${o.name} (0${o.phone.slice(3)})`); if (o.method) kv('Service:', o.method);
  y += 6; d.rect(L, y, W, 18).fill('#eef6f8'); d.fillColor('#0a2a5c').font('Helvetica-Bold').fontSize(8.5);
  const cx = [L + 6, L + W - 175, L + W - 135, L + W - 70]; d.text('Item', cx[0], y + 5); d.text('Qty', cx[1], y + 5, { width: 35, align: 'right' }); d.text('Rate', cx[2], y + 5, { width: 60, align: 'right' }); d.text('Amount', cx[3], y + 5, { width: 64, align: 'right' });
  y += 24; d.font('Helvetica').fillColor('#222').fontSize(8.5);
  for (const i of f.items) {
    if (y > d.page.height - 170) { d.addPage(); y = 36; d.font('Helvetica').fillColor('#222').fontSize(8.5); }
    const nm = `${i.name}${i.from_price ? ' (from)' : ''} - ${i.unit}`;
    d.text(nm, cx[0], y, { width: cx[1] - cx[0] - 8 }); const h = d.y - y;
    d.text(String(i.qty), cx[1], y, { width: 35, align: 'right' }).text(Number(i.price).toLocaleString('en-KE'), cx[2], y, { width: 60, align: 'right' }).text((i.price * i.qty).toLocaleString('en-KE', { maximumFractionDigits: 2 }), cx[3], y, { width: 64, align: 'right' });
    y += Math.max(h, 11) + 4; d.moveTo(L, y - 2).lineTo(L + W, y - 2).lineWidth(.4).stroke('#d9e3ea');
  }
  if (y > d.page.height - 150) { d.addPage(); y = 36; }
  y += 6; const tot = (k, v, c, b) => { d.font(b ? 'Helvetica-Bold' : 'Helvetica').fontSize(b ? 11 : 9).fillColor(c || '#222').text(k, L + W - 200, y, { width: 100 }).text(v, L + W - 100, y, { width: 100, align: 'right' }); y += b ? 18 : 14; };
  tot('Total', kes(o.total), '#0a2a5c', true); tot('Paid', kes(f.paid), '#0c8c80'); tot('Balance due', kes(bal), bal > 0 ? '#b3261e' : '#0c8c80', true);
  const vp = f.payments.filter(p => p.status === 'verified');
  if (vp.length) { y += 4; d.font('Helvetica-Bold').fontSize(8.5).fillColor('#0a2a5c').text('Payments received', L, y); y += 12; d.font('Helvetica').fillColor('#444');
    vp.forEach(p => { d.text(`${p.method === 'cash' ? 'Cash' : 'M-Pesa'} ${p.mpesa_code || ''}   ${kes(p.amount)}`, L, y); y += 11; }); }
  if (f.items.some(i => i.from_price)) { y += 4; d.font('Helvetica-Oblique').fontSize(7.5).fillColor('#777').text('Items marked "from" are starting prices; the final amount is confirmed when we inspect the item.', L, y, { width: W }); y = d.y; }
  y += 8; d.font('Helvetica').fontSize(8).fillColor('#555');
  d.text(`Track your order: enter ${o.ref} and your phone number on our website${M.publicUrl ? ' (' + M.publicUrl.replace(/\/$/, '') + '/#/track/' + o.ref + ')' : ''}.`, L, y, { width: W });
  d.moveDown(.4).text(o.pay_status === 'paid' ? 'Payment received. Thank you!' : 'This receipt shows the status of your order. It becomes PAID once your payment is confirmed.', { width: W });
  d.moveDown(.4).font('Helvetica-Bold').fillColor('#0c8c80').text('Thank you. Your Satisfaction, Our Priority.', { width: W, align: 'center' }); d.end();
}
app.get('/api/orders/:ref/receipt', lim, A((req, res) => {
  const o = orderFor(req.params.ref, req.query.phone); if (!o) return res.status(404).json({ error: 'Not found.' });
  sendReceipt(res, o);
}));

/* ---------- admin ---------- */
const adm = express.Router(); adm.use(needStaff);
adm.get('/summary', A((_q, res) => {
  const sum = w => db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='verified' ${w}`).get().s;
  res.json({ revenue: sum(''), today: sum("AND date(created)=date('now')"), week: sum("AND date(created)>=date('now','-6 days')"), month: sum("AND strftime('%Y-%m',created)=strftime('%Y-%m','now')"),
    outstanding: db.prepare("SELECT COALESCE(SUM(o.total-COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id=o.id AND p.status='verified'),0)),0) s FROM orders o WHERE o.status!='Cancelled'").get().s,
    awaiting: db.prepare("SELECT COUNT(*) c FROM payments WHERE status='awaiting_verification'").get().c,
    byStatus: db.prepare('SELECT status,COUNT(*) c FROM orders GROUP BY status').all(),
    byDept: db.prepare("SELECT oi.dept,SUM(oi.price*oi.qty) s FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.pay_status='paid' GROUP BY oi.dept").all(),
    daily: db.prepare("SELECT date(created) d,SUM(amount) s FROM payments WHERE status='verified' AND date(created)>=date('now','-13 days') GROUP BY d").all() });
}));
adm.get('/orders', A((req, res) => {
  const st = S(req.query.status, 30), q = '%' + S(req.query.q, 40) + '%';
  res.json(db.prepare(`SELECT * FROM orders WHERE (?='' OR status=?) AND (ref LIKE ? OR name LIKE ? OR phone LIKE ?) ORDER BY id DESC LIMIT 300`).all(st, st, q, q, q).map(full));
}));
adm.patch('/orders/:id', A((req, res) => {
  if (!STATUSES.includes(req.body?.status)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status, Number(req.params.id)); res.json({ ok: true });
}));
adm.patch('/orders/:id/total', needAdmin, A((req, res) => { // for "from" priced items: set the final agreed amount
  const t = round2(Number(req.body?.total)), id = Number(req.params.id); if (!(t > 0) || !db.prepare('SELECT 1 FROM orders WHERE id=?').get(id)) return res.status(400).json({ error: 'Enter a valid total.' });
  db.prepare('UPDATE orders SET total=? WHERE id=?').run(t, id); res.json({ pay_status: recalc(id) });
}));
adm.get('/orders/:id/receipt', A((req, res) => { const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(req.params.id)); o ? sendReceipt(res, o) : res.status(404).json({ error: 'Not found.' }); }));
adm.post('/orders/:id/cash', A((req, res) => {
  const a = Number(req.body?.amount), id = Number(req.params.id); if (!(a > 0) || !db.prepare('SELECT 1 FROM orders WHERE id=?').get(id)) return res.status(400).json({ error: 'Enter a valid amount.' });
  db.prepare("INSERT INTO payments(order_id,method,amount,status,verified_by) VALUES(?,?,?,'verified',?)").run(id, 'cash', a, 'user:' + req.user.id); res.json({ pay_status: recalc(id) });
}));
adm.get('/payments', A((_q, res) => res.json(db.prepare(`SELECT p.*,o.ref,o.name,o.phone,o.total FROM payments p JOIN orders o ON o.id=p.order_id ORDER BY (p.status='awaiting_verification') DESC,p.id DESC LIMIT 300`).all())));
adm.post('/payments/:id/verify', needAdmin, A((req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(Number(req.params.id)), a = Number(req.body?.amount);
  if (!p || p.status !== 'awaiting_verification' || !(a > 0)) return res.status(400).json({ error: 'Nothing to verify, or invalid amount.' });
  db.prepare("UPDATE payments SET status='verified',amount=?,verified_by=? WHERE id=?").run(a, 'user:' + req.user.id, p.id); res.json({ pay_status: recalc(p.order_id) });
}));
adm.post('/payments/:id/reject', needAdmin, A((req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(Number(req.params.id)); if (!p || p.status !== 'awaiting_verification') return res.status(400).json({ error: 'Nothing to reject.' });
  db.prepare("UPDATE payments SET status='failed',verified_by=? WHERE id=?").run('user:' + req.user.id, p.id); res.json({ pay_status: recalc(p.order_id) });
}));
adm.get('/customers', A((_q, res) => res.json(db.prepare(`SELECT u.id,u.name,u.phone,u.email,u.created,COUNT(o.id) orders,COALESCE(SUM(o.total),0) billed FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY billed DESC`).all())));

/* price management (admin only) */
adm.get('/services', A((_q, res) => res.json(db.prepare('SELECT * FROM services ORDER BY dept,id').all())));
adm.post('/services', needAdmin, A((req, res) => {
  const b = req.body || {}; if (!DEPTS.includes(b.dept) || !S(b.name) || !(Number(b.price) >= 0)) return res.status(400).json({ error: 'Check department, name and price.' });
  insSvc.run(b.dept, S(b.name), S(b.unit, 30) || 'each', Number(b.price), b.from_price ? 1 : 0); res.json({ ok: true });
}));
adm.put('/services/:id', needAdmin, A((req, res) => {
  const b = req.body || {}; if (!S(b.name) || !(Number(b.price) >= 0)) return res.status(400).json({ error: 'Check name and price.' });
  db.prepare('UPDATE services SET name=?,unit=?,price=?,active=?,from_price=? WHERE id=?').run(S(b.name), S(b.unit, 30) || 'each', Number(b.price), b.active ? 1 : 0, b.from_price ? 1 : 0, Number(req.params.id)); res.json({ ok: true });
}));
adm.delete('/services/:id', needAdmin, A((req, res) => {
  const id = Number(req.params.id);
  if (db.prepare('SELECT 1 FROM order_items WHERE service_id=?').get(id)) { db.prepare('UPDATE services SET active=0 WHERE id=?').run(id); return res.json({ hidden: true }); }
  db.prepare('DELETE FROM services WHERE id=?').run(id); res.json({ deleted: true });
}));
adm.post('/services/bulk', needAdmin, A((req, res) => { // raise or lower prices by a percentage for one department (or all)
  const p = Number(req.body?.percent), r = [1, 5, 10].includes(Number(req.body?.round)) ? Number(req.body.round) : 5, d = req.body?.dept;
  if (!(p >= -90 && p <= 300) || p === 0 || (d !== 'all' && !DEPTS.includes(d))) return res.status(400).json({ error: 'Choose a department and a percentage between -90 and 300.' });
  const rows = db.prepare("SELECT id,price FROM services WHERE price>0 AND (?='all' OR dept=?)").all(d, d); db.exec('BEGIN');
  try { const up = db.prepare('UPDATE services SET price=? WHERE id=?'); rows.forEach(s => up.run(Math.max(r, Math.round(s.price * (1 + p / 100) / r) * r), s.id)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ changed: rows.length });
}));
adm.post('/services/load-defaults', needAdmin, A((_q, res) => res.json({ added: loadDefaults() })));
adm.get('/export/prices.csv', A((_q, res) => {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  res.type('text/csv').attachment('ustawi-prices.csv').send(['Department,Item,Unit,Price (KSh),Starting price,Active'].concat(db.prepare('SELECT * FROM services ORDER BY dept,id').all().map(s => [s.dept, s.name, s.unit, s.price, s.from_price ? 'from' : '', s.active ? 'yes' : 'no'].map(q).join(','))).join('\n'));
}));
adm.get('/export/orders.csv', A((_q, res) => {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  res.type('text/csv').attachment('orders.csv').send(['Order,Date,Customer,Phone,Total,Paid,Payment status,Status'].concat(rows.map(o => [o.ref, o.created, o.name, o.phone, o.total, paidSum(o.id), o.pay_status, o.status].map(q).join(','))).join('\n'));
}));
app.use('/api/admin', adm);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use('/api', (_q, res) => res.status(404).json({ error: 'Not found' }));
app.listen(PORT, () => console.log(`Ustawi running: http://localhost:${PORT}  (admin: /admin)  |  M-Pesa prompt: ${stkReady() ? 'ON' : 'OFF (add keys in mpesa.config.js or .env)'}`));
