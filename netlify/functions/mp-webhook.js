// netlify/functions/mp-webhook.js  (CommonJS, Node 18+)
const jwt = require('jsonwebtoken');

module.exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    console.log('MP-WEBHOOK-RESULT', JSON.stringify({ ok: true, token, link }));
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const secret = process.env.ACCESS_TOKEN_SECRET;          // já existe
  const siteUrl = process.env.SITE_URL || 'https://labnivel.netlify.app';
  const mpToken = process.env.MP_ACCESS_TOKEN;             // vamos criar agora

  if (!secret)  return { statusCode: 500, body: 'ACCESS_TOKEN_SECRET não configurado' };
  if (!mpToken) return { statusCode: 500, body: 'MP_ACCESS_TOKEN não configurado' };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  // Mercado Pago manda o ID do pagamento em body.data.id (ou às vezes como query ?id=)
  const paymentId = body?.data?.id || event.queryStringParameters?.id;
  if (!paymentId) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignore: true, reason: 'no payment id' }) };
  }

  // Busca detalhes do pagamento
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpToken}` }
  });
  const info = await resp.json();

  if (resp.status !== 200) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: info }) };
  }

  const status = info.status; // 'approved', 'in_process', 'rejected', etc.
  const email  = info?.payer?.email || body?.email || 'sem-email';

  if (status !== 'approved') {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignore: true, status }) };
  }

  // Gerar link com token (24h)
  const token = jwt.sign({ email }, secret, { expiresIn: '24h' });
  const link  = `${siteUrl}/index.html?token=${token}`;

  return { statusCode: 200, body: JSON.stringify({ ok: true, token, link }) };{ "ok": true, "token": "<jwt>" };{ "ok": false, "pending": true }
};
// netlify/functions/mp-webhooks.js
const MP_API = 'https://api.mercadopago.com/v1/payments/';

exports.handler = async (event) => {
  try {
    const token = process.env.MP_ACCESS_TOKEN;
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const body = JSON.parse(event.body || '{}');
    // MP envia notificações em diferentes formatos; garantimos pegar o ID
    const paymentId =
      body?.data?.id || body?.id || body?.resource?.split('/').pop();

    if (!paymentId) return { statusCode: 200, body: 'noop' };

    // Busca o pagamento para ter certeza do status e preference_id
    const r = await fetch(MP_API + paymentId, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return { statusCode: 200, body: 'ignored' };
    const pay = await r.json();

    if (pay.status !== 'approved') {
      return { statusCode: 200, body: 'pending' };
    }

    const pref = pay?.order?.id || pay?.external_reference || pay?.additional_info?.external_reference || pay?.metadata?.preference_id || pay?.metadata?.preferenceId || pay?.preference_id;
    const payerEmail = pay?.payer?.email || '';

    if (!pref) return { statusCode: 200, body: 'no pref' };

    // Salva marcação no Netlify Blobs (namespace default)
    const store = await import('@netlify/blobs');
    const blobs = store.blobs;
    await blobs.set(`paid/${pref}.json`, JSON.stringify({
      paid: true,
      email: payerEmail,
      at: Date.now(),
      payment_id: paymentId
    }), { contentType: 'application/json' });

    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    return { statusCode: 200, body: 'err ' + String(e) };
  }
};
