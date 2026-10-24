// =====================================================================================
//  M-PESA (SAFARICOM DARAJA) INTEGRATION KEYS
//  Paste your keys between the quotes below, OR put them in the .env file (either works).
//  Get them at https://developer.safaricom.co.ke  (create an app -> enable "Lipa Na M-Pesa Online")
// =====================================================================================
require('dotenv').config();
const E = process.env;
module.exports = {
  env:            E.MPESA_ENV || 'sandbox',            // 'sandbox' while testing, 'production' when you go live
  consumerKey:    E.MPESA_CONSUMER_KEY    || '',       // <-- PASTE Daraja Consumer Key here
  consumerSecret: E.MPESA_CONSUMER_SECRET || '',       // <-- PASTE Daraja Consumer Secret here
  shortcode:      E.MPESA_SHORTCODE       || '',       // <-- BusinessShortCode (Buy Goods: your Store/Head-Office number. Sandbox: 174379)
  passkey:        E.MPESA_PASSKEY         || '',       // <-- PASTE Lipa Na M-Pesa Online Passkey here
  till:           E.MPESA_TILL            || '1747080',// Your Till number (PartyB for Buy Goods)
  txType:         E.MPESA_TX_TYPE         || 'CustomerBuyGoodsOnline', // Paybill: 'CustomerPayBillOnline'
  publicUrl:      E.PUBLIC_URL            || '',       // <-- Public HTTPS address of this site (ngrok URL while testing, your domain live)
  callbackSecret: E.MPESA_CALLBACK_SECRET || 'change-me-random-string', // any long random text; protects the callback URL
};
