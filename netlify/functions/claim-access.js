// netlify/functions/claim-access.js  (CommonJS)
const jwt = require('jsonwebtoken');

module.exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    // Mercado Pago pode enviar payment_id, collection_id, data.id, id
    const paymentId =
      qs.payment_id || qs.collection_id || qs['data.id'] || qs.id;

    const mpToken = process.env.MP_ACCESS_TOKEN;
    const secret  = process.env.ACCESS_TOKEN_SECRET;
    const siteUrl = process.env.SITE_URL || 'https://labnivel.netlify.app';

    if (!paymentId) {
      // Se voltar sem id, manda para a INTRO
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/index.html#faltou-payment_id` }
      };
    }
    if (!mpToken || !secret) {
      return { statusCode: 500, body: 'Config ausente (MP_ACCESS_TOKEN/ACCESS_TOKEN_SECRET).' };
    }

    // Consulta o pagamento no Mercado Pago
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` }
    });
    const info = await r.json();

    if (r.status !== 200) {
      console.log('MP-ERROR', info);
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/index.html#erro-consulta` }
      };
    }

    const status = info.status; // 'approved', 'in_process', 'rejected', etc.
    const email  = (info && info.payer && info.payer.email) ? info.payer.email : 'sem-email';

    // Se ainda não aprovado, volta para o site com status na âncora
    if (status !== 'approved') {
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/index.html#pagamento-${status || 'desconhecido'}` }
      };
    }

    // Aprovado: gera token e redireciona para o jogo liberado
    const token = jwt.sign({ email }, secret, { expiresIn: '24h' });
    const link  = `${siteUrl}/index.html?token=${token}`;

    console.log('CLAIM-ACCESS-RESULT', JSON.stringify({ ok:true, paymentId, link }));
    return { statusCode: 302, headers: { Location: link } };
  } catch (e) {
    console.log('CLAIM-ACCESS-ERROR', e);
    return { statusCode: 302, headers: { Location: '/index.html#erro-inesperado' } };
  }
};
