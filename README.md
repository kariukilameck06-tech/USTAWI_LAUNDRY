# Ustawi Laundry and Computer Services: website + admin

Public site (`/`), admin dashboard (`/admin`), Node/Express API and a SQLite database file (`ustawi.db`, created automatically).

## Run it (Windows + VS Code)
1. Install **Node.js 22.13 or newer** from nodejs.org.
2. Open this folder in VS Code, open the terminal and run: `npm install`
3. Copy `.env.example` to `.env`. Set `JWT_SECRET` (long random text), `ADMIN_PHONE`, `ADMIN_PASSWORD` (10+ characters) and your business details.
4. Run `npm start`, then open http://localhost:3000 (admin: http://localhost:3000/admin).

Folder layout: `server.js` (API), `mpesa.config.js` (M-Pesa keys), `prices.js` (your starting price list), `public/` (the website: `index.html`, `app.js`, `styles.css`, `admin.html`, `admin.js`, `images/`).

## Prices: the admin controls everything (no code editing)
Log in at `/admin` > **Services & prices**:
- Edit any name, unit or price, then press **Save changes**. The website, the order page and both price calculators use the new prices immediately.
- **Change prices by %** raises or lowers a whole department (e.g. +10% on laundry) and rounds to KSh 5/10/1.
- **Add item**, **Delete** (items used in past orders are hidden instead), tick **From** for starting prices, untick **Active** or set price 0 to hide.
- **Export CSV** downloads the price list. **Load default price list** adds any items from `prices.js` that are missing (it never overwrites your prices).
- Orders: **Edit total** lets the admin set the final amount for "from" items after inspection; **Receipt** downloads any order's receipt; **Record cash** records cash payments.

Only the `admin` role can change prices; `staff` accounts can view them. The first run loads your full price list (144 items) automatically. Customers are always charged the price in the database at the moment they order.

## Receipt with order number (Paid / Unpaid)
When the customer reaches the payment step they see their **order number** and can **download a PDF receipt** straight away. The receipt shows the order number, items, total, amount paid, balance due and a stamp: **UNPAID**, **PAYMENT PENDING**, **PART PAID** or **PAID**. The customer uses the order number (plus their phone number) on **Track order** to follow progress, and can pay later from there with **Pay now**.

## M-Pesa prompt (STK push): where to put your keys
Open **`mpesa.config.js`** and paste your Daraja keys where marked (or put them in `.env`; either works):
`consumerKey`, `consumerSecret`, `shortcode`, `passkey`, `publicUrl`, and change `callbackSecret` to any long random text.
- Get keys at https://developer.safaricom.co.ke (create an app, enable *Lipa Na M-Pesa Online*).
- Buy Goods Till: `shortcode` is your Store/Head-Office number, `till` is your Till (1747080), `txType` stays `CustomerBuyGoodsOnline`. Paybill: set `txType` to `CustomerPayBillOnline`.
- `publicUrl` must be a public HTTPS address (use ngrok while testing, e.g. `https://abc123.ngrok-free.app`). Safaricom sends the result to `/api/mpesa/callback/<callbackSecret>`.
- Test with `env: 'sandbox'` first, then switch to `'production'` with your live keys.
- If the callback is delayed, the server also asks Safaricom for the result itself, so the order still turns PAID.
- Until keys are added, the M-Pesa prompt button tells the customer to use the Till instead.
- **Till (manual):** the customer pastes the M-Pesa message; it appears in Admin > Payments as "awaiting verification"; check your Till statement and click Verify.

## Photos and map
- The site ships with colourful built-in illustrations. To use real photos, put JPGs in `public/images/` named `hero.jpg`, `laundry.jpg`, `computer.jpg`, `stationery.jpg`, `tailoring.jpg`, `delivery.jpg`. They replace the illustrations automatically.
- The map at the bottom of the home page (and on Contact) uses `BUSINESS_MAP_QUERY` in `.env` (an address or `lat,lng`). Until you set it the map shows Nairobi.

## Deploy
Any Node 22+ host (Render, Railway, a VPS). Set the `.env` values as environment variables, serve over HTTPS, and keep `ustawi.db` on a persistent disk and back it up.

## Not included yet
Email/SMS notifications, expense and profit tracking, stock levels, staff permission editor, automated tests.
