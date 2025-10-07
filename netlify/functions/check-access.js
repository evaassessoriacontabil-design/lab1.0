// netlify/functions/check-access.js  (CommonJS, Node 18+)
const jwt = require('jsonwebtoken');

const SITE = process.env.SITE_URL || 'https://labnivel.netlify.app';
const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const SECRET   = process.env.ACCESS_TOKEN_SECRET;

// janela de busca em /v1/payments/search (2 horas)
function isoMinutesAgo(m) {
  return new Date(Date.now() - m*60*1000).toISOString();
}

async function fetchJSON(url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` }
  });
  const j = await r.json();
  return { ok: r.ok, status: r.status, data: j };
}

module.exports.handler = async (event) => {
  try {
    if (!MP_TOKEN || !SECRET) {
      return { statusCode: 200, body: JSON.stringify({ ok:false, error:'env' }) };
    }

    const qs = event.queryStringParameters || {};
    const pref = qs.preference_id || qs.pref_id || qs['preference-id'] || '';
    let paymentId = qs.payment_id || qs.collection_id || qs['data.id'] || qs.id || '';

    // (1) Se já temos payment_id, verifica direto
    if (paymentId) {
      const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
      const { ok, data } = await fetchJSON(url);
      if (ok && data && data.status === 'approved') {
        const email = (data.payer && data.payer.email) || 'sem-email';
        const token = jwt.sign({ email, aud:'labnivel', origin: SITE }, SECRET, { expiresIn:'24h' });
        const link  = `${SITE}/index.html?token=${token}`;
        return { statusCode:200, body: JSON.stringify({ ok:true, link }) };
      }
      // se não aprovado, cai para as buscas
      paymentId = '';
    }

    // (2) Tenta resolver payment_id via merchant_orders (preference_id)
    if (!paymentId && pref) {
      const url = `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(pref)}`;
      const { ok, data } = await fetchJSON(url);
      if (ok && data && data.elements && data.elements[0] && data.elements[0].payments && data.elements[0].payments[0]) {
        // pega o último pagamento
        const payments = data.elements[0].payments.slice().sort((a,b)=> new Date(b.date_created)-new Date(a.date_created));
        if (payments[0].id) paymentId = payments[0].id;
      }
    }

    // (3) Fallback robusto: busca pagamentos aprovados recentes e filtra
    if (!paymentId) {
      const begin = isoMinutesAgo(120); // 2 horas
      const end   = new Date().toISOString();
      const url = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=20&range=date_created&begin_date=${encodeURIComponent(begin)}&end_date=${encodeURIComponent(end)}`;
      const { ok, data } = await fetchJSON(url);
      if (ok && data && data.results && data.results.length) {
        const hit = data.results.find(p => {
          if (p.status !== 'approved') return false;
          if (Math.abs((p.transaction_amount || 0) - 29.9) > 0.01) return false; // valor do item
          const metaPref  = p.metadata && (p.metadata.preference_id || p.metadata.pref_id);
          const orderId   = p.order && p.order.id;
          const hasTitle  = Array.isArray(p.additional_info?.items) && p.additional_info.items.some(i => (i.title||'').includes('Ativar Jogo'));
          return (pref && (metaPref === pref || orderId === pref)) || hasTitle;
        });
        if (hit) paymentId = hit.id;
      }
    }

    if (!paymentId) {
      // ainda não achou — peça ao cliente para aguardar; /acesso.html continuará tentando
      return { statusCode:200, body: JSON.stringify({ ok:false, status:'aguardando' }) };
    }

    // Verifica pagamento final
    const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const { ok, data } = await fetchJSON(url);
    if (!ok) {
      return { statusCode:200, body: JSON.stringify({ ok:false, status:'lookup-error' }) };
    }

    if (data.status !== 'approved') {
      return { statusCode:200, body: JSON.stringify({ ok:false, status: data.status || 'in_process' }) };
    }

    const email = (data.payer && data.payer.email) || 'sem-email';
    const token = jwt.sign({ email, aud:'labnivel', origin: SITE }, SECRET, { expiresIn:'24h' });
    const link  = `${SITE}/index.html?token=${token}`;
    return { statusCode:200, body: JSON.stringify({ ok:true, link }) };

  } catch (e) {
    return { statusCode:200, body: JSON.stringify({ ok:false, status:'exception' }) };
  }
};
