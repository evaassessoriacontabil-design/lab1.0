// netlify/functions/check-access.js  (CommonJS, Node 18+)
const jwt = require('jsonwebtoken');

module.exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const siteUrl = process.env.SITE_URL || 'https://labnivel.netlify.app';
    const mpToken = process.env.MP_ACCESS_TOKEN;
    const secret  = process.env.ACCESS_TOKEN_SECRET;

    if (!mpToken || !secret) {
      return { statusCode: 200, body: JSON.stringify({ ok:false, error:'env' }) };
    }

    let paymentId = qs.payment_id || qs.collection_id || qs['data.id'] || qs.id;

    if (!paymentId && (qs.preference_id || qs.pref_id || qs['preference-id'])) {
      const pref = qs.preference_id || qs.pref_id || qs['preference-id'];
      try {
        const r = await fetch(
          `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(pref)}`,
          { headers: { Authorization: `Bearer ${mpToken}` } }
        );
        const mo = await r.json();
        const order = mo && mo.elements && mo.elements[0];
        if (order && Array.isArray(order.payments) && order.payments.length > 0) {
          order.payments.sort((a,b)=>new Date(b.date_created)-new Date(a.date_created));
          paymentId = order.payments[0].id;
        }
      } catch(e) {}
    }

    if (!paymentId) {
      return { statusCode: 200, body: JSON.stringify({ ok:false, status:'no-id' }) };
    }

    const rPay = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` }
    });
    const info = await rPay.json();
    if (rPay.status !== 200) {
      return { statusCode: 200, body: JSON.stringify({ ok:false, status:'lookup-error', detail:info }) };
    }

    const status = info.status;
    const email  = (info && info.payer && info.payer.email) ? info.payer.email : 'sem-email';

    if (status !== 'approved') {
      return { statusCode: 200, body: JSON.stringify({ ok:false, status }) };
    }

    const token = jwt.sign(
      { email, aud:'labnivel', origin: siteUrl }, // trava de domínio
      secret, { expiresIn:'24h' }
    );
    const link  = `${siteUrl}/index.html?token=${token}`;
    return { statusCode: 200, body: JSON.stringify({ ok:true, link }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, status:'exception' }) };
  }
};
