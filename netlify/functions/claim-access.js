// netlify/functions/claim-access.js  (CommonJS, Node 18+)
const jwt = require('jsonwebtoken');

module.exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const siteUrl = process.env.SITE_URL || 'https://labnivel.netlify.app';
    const mpToken = process.env.MP_ACCESS_TOKEN;
    const secret  = process.env.ACCESS_TOKEN_SECRET;

    if (!mpToken || !secret) {
      return { statusCode: 500, body: 'Config ausente (MP_ACCESS_TOKEN / ACCESS_TOKEN_SECRET).' };
    }

    // 1) tenta pegar payment_id direto
    let paymentId = qs.payment_id || qs.collection_id || qs['data.id'] || qs.id;

    // 2) se não houver, tenta via preference_id (inclui "preference-id")
    if (!paymentId && (qs.preference_id || qs.pref_id || qs['preference-id'])) {
      const pref = qs.preference_id || qs.pref_id || qs['preference-id'];
      try {
        const moResp = await fetch(
          `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(pref)}`,
          { headers: { Authorization: `Bearer ${mpToken}` } }
        );
        const mo = await moResp.json();
        const order = mo && mo.elements && mo.elements[0];
        if (order && Array.isArray(order.payments) && order.payments.length > 0) {
          order.payments.sort((a,b)=>new Date(b.date_created)-new Date(a.date_created));
          if (order.payments[0].id) paymentId = order.payments[0].id;
        }
      } catch (e) {
        console.log('CLAIM-ACCESS merchant_orders error', e);
      }
    }

    if (!paymentId) {
      return { statusCode: 302, headers: { Location: `${siteUrl}/index.html#faltou-payment_id-ou-preference_id` } };
    }

    // 3) consulta o pagamento
    const payResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` }
    });
    const info = await payResp.json();
    if (payResp.status !== 200) {
      return { statusCode: 302, headers: { Location: `${siteUrl}/index.html#erro-consulta` } };
    }

    const status = info.status;
    const email  = (info && info.payer && info.payer.email) ? info.payer.email : 'sem-email';

    if (status !== 'approved') {
      return { statusCode: 302, headers: { Location: `${siteUrl}/index.html#pagamento-${status || 'desconhecido'}` } };
    }

    // 4) aprovado: gera token e redireciona
    const token = jwt.sign({ email }, secret, { expiresIn: '24h' });
    const link  = `${siteUrl}/index.html?token=${token}`;
    console.log('CLAIM-ACCESS-RESULT', JSON.stringify({ ok: true, paymentId, link }));
    return { statusCode: 302, headers: { Location: link } };

  } catch (e) {
    console.log('CLAIM-ACCESS-ERROR', e);
    return { statusCode: 302, headers: { Location: '/index.html#erro-inesperado' } };
  }
};
