// netlify/functions/claim-access.js  (CommonJS, Node 18+)
const jwt = require('jsonwebtoken');

module.exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const siteUrl = process.env.SITE_URL || 'https://labnivel.netlify.app';
    const mpToken = process.env.MP_ACCESS_TOKEN;
    const secret  = process.env.ACCESS_TOKEN_SECRET;

    if (!mpToken || !secret) {
      console.log('CLAIM-ACCESS missing env', { hasMp: !!mpToken, hasSecret: !!secret });
      return { statusCode: 500, body: 'Config ausente (MP_ACCESS_TOKEN / ACCESS_TOKEN_SECRET).' };
    }

    // 1) tenta pegar payment_id direto (cartão/aprovação imediata)
    let paymentId =
      qs.payment_id || qs.collection_id || qs['data.id'] || qs.id;

    // 2) se não houver payment_id, tenta resolver via preference_id (muito comum em PIX)
    if (!paymentId && (qs.preference_id || qs.pref_id)) {
      const pref = qs.preference_id || qs.pref_id;
      try {
        const moResp = await fetch(
          `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(pref)}`,
          { headers: { Authorization: `Bearer ${mpToken}` } }
        );
        const mo = await moResp.json();
        const order = mo && mo.elements && mo.elements[0];

        // pega o pagamento mais recente desta ordem
        if (order && Array.isArray(order.payments) && order.payments.length > 0) {
          // ordena por data desc só por segurança
          order.payments.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
          if (order.payments[0].id) paymentId = order.payments[0].id;
        }
      } catch (e) {
        console.log('CLAIM-ACCESS merchant_orders error', e);
      }
    }

    // 3) se ainda não tiver paymentId, volta para o site com info
    if (!paymentId) {
      console.log('CLAIM-ACCESS no payment id', { qs });
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/index.html#faltou-payment_id-ou-preference_id` }
      };
    }

    // 4) consulta o pagamento
    const payResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` }
    });
    const info = await payResp.json();

    if (payResp.status !== 200) {
      console.log('CLAIM-ACCESS payment lookup error', { paymentId, info });
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/index.html#erro-consulta` }
      };
    }

    const status = info.status; // 'approved', 'in_process', 'rejected', etc.
    const email  = (info && info.payer && info.payer.email) ? info.payer.email : 'sem-email';

    if (status !== 'approved') {
      console.log('CLAIM-ACCESS not approved yet', { paymentId, status });
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/index.html#pagamento-${status || 'desconhecido'}` }
      };
    }

    // 5) aprovado: gera token e redireciona para o jogo liberado
    const token = jwt.sign({ email }, secret, { expiresIn: '24h' });
    const link  = `${siteUrl}/index.html?token=${token}`;

    console.log('CLAIM-ACCESS-RESULT', JSON.stringify({ ok: true, paymentId, link }));
    return { statusCode: 302, headers: { Location: link } };

  } catch (e) {
    console.log('CLAIM-ACCESS-ERROR', e);
    return { statusCode: 302, headers: { Location: '/index.html#erro-inesperado' } };
  }
};
