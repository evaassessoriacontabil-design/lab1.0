// netlify/functions/check-access.js  (CommonJS, Node 18+)
const jwt = require('jsonwebtoken');

const SITE   = process.env.SITE_URL || 'https://labnivel.netlify.app';
const MP     = process.env.MP_ACCESS_TOKEN;
const SECRET = process.env.ACCESS_TOKEN_SECRET;

/* util */
const j = (x) => JSON.stringify(x);
const okBody = (o) => ({ statusCode: 200, body: j(o) });

/* retorna ISO agora - N minutos */
function isoMinutesAgo(m) { return new Date(Date.now() - m*60*1000).toISOString(); }

async function getJSON(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${MP}` }});
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}

/* resolve payment_id por merchant_orders (preference_id) */
async function resolveByMerchantOrder(pref) {
  const url = `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(pref)}`;
  const { ok, data } = await getJSON(url);
  if (!ok || !data || !data.elements || !data.elements.length) return { id:null, hint:'mo-empty' };
  const mo = data.elements[0];
  if (!mo.payments || !mo.payments.length) return { id:null, hint:'mo-no-payments' };
  const last = mo.payments.slice().sort((a,b)=> new Date(b.date_created) - new Date(a.date_created))[0];
  return { id: last.id || null, hint:'mo-hit' };
}

/* fallback robusto: busca pagamentos aprovados recentes */
async function resolveByPaymentsSearch(pref, debug=false) {
  // janela ampla: últimas 24h
  const begin = isoMinutesAgo(24*60), end = new Date().toISOString();
  const url = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=50&range=date_created&begin_date=${encodeURIComponent(begin)}&end_date=${encodeURIComponent(end)}`;
  const { ok, data } = await getJSON(url);
  if (!ok || !data || !data.results) return { id:null, hint:'search-empty', raw: debug ? data : undefined };

  const hit = data.results.find(p => {
    if (p.status !== 'approved') return false;
    // valor do produto
    const valOk = Math.abs((p.transaction_amount || 0) - 29.9) <= 0.01;
    // preferências possíveis colocadas pelo MP
    const metaPref = p.metadata && (p.metadata.preference_id || p.metadata.pref_id);
    const orderId  = p.order && p.order.id;
    // título do item
    const hasTitle = Array.isArray(p.additional_info?.items) &&
                     p.additional_info.items.some(i => (i.title || '').toLowerCase().includes('ativar jogo'));
    // heurística: se temos pref, confere; se não, confere por título+valor
    return (pref ? (metaPref === pref || orderId === pref) : true) &&
           (valOk || hasTitle);
  });

  if (!hit) return { id:null, hint:'search-no-hit', raw: debug ? data : undefined };
  return { id: hit.id, hint:'search-hit', raw: debug ? hit : undefined };
}

/* verifica status do pagamento no MP */
async function isApproved(paymentId) {
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const { ok, data } = await getJSON(url);
  if (!ok) return { approved:false, hint:'pay-lookup-fail', raw:data };
  return { approved: data.status === 'approved', email: (data.payer && data.payer.email) || 'sem-email', raw:data };
}

module.exports.handler = async (event) => {
  try {
    if (!MP || !SECRET) return okBody({ ok:false, error:'env' });

    const qs    = event.queryStringParameters || {};
    const pref  = qs.preference_id || qs.pref_id || qs['preference-id'] || '';
    const debug = qs.debug === '1';
    let   pid   = qs.payment_id || qs.collection_id || qs['data.id'] || qs.id || '';

    const diag = { step:'start', pref, fromQuery: pid || null };

    // (1) se já veio payment_id, verifica direto
    if (pid) {
      diag.step = 'has-pid';
      const r = await isApproved(pid);
      if (r.approved) {
        const token = jwt.sign({ email:r.email, aud:'labnivel', origin:SITE }, SECRET, { expiresIn:'24h' });
        return okBody({ ok:true, link:`${SITE}/index.html?token=${token}`, ...(debug?{diag:{...diag, approved:true}}:{}) });
      }
      // não aprovado → zera para tentar outras vias
      pid = '';
      diag.payLookup = r.hint || 'not-approved';
    }

    // (2) tenta achar por merchant_order (pref)
    if (!pid && pref) {
      diag.step = 'mo';
      const r = await resolveByMerchantOrder(pref);
      if (r.id) {
        pid = r.id;
        diag.mo = r.hint;
      } else {
        diag.mo = r.hint;
      }
    }

    // (3) fallback /v1/payments/search (janela 24h)
    if (!pid) {
      diag.step = 'search';
      const r = await resolveByPaymentsSearch(pref, debug);
      if (r.id) {
        pid = r.id;
        diag.search = r.hint;
        if (debug) diag.searchRaw = r.raw;
      } else {
        diag.search = r.hint;
        if (debug) diag.searchRaw = r.raw;
      }
    }

    if (!pid) {
      // ainda aguardando: /acesso.html continuará fazendo polling
      return okBody({ ok:false, status:'aguardando', ...(debug?{diag}:{}) });
    }

    // (4) confirma status final
    diag.step = 'confirm';
    const r = await isApproved(pid);
    if (!r.approved) {
      return okBody({ ok:false, status: r.raw?.status || 'in_process', ...(debug?{diag}:{}) });
    }

    const token = jwt.sign({ email:r.email, aud:'labnivel', origin:SITE }, SECRET, { expiresIn:'24h' });
    return okBody({ ok:true, link:`${SITE}/index.html?token=${token}`, ...(debug?{diag}:{}) });

  } catch (e) {
    return okBody({ ok:false, status:'exception' });
  }
};
