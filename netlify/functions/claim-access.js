// netlify/functions/claim-access.js
const crypto = require('crypto');

function b64u(objOrBuf) {
  const buf = Buffer.isBuffer(objOrBuf) ? objOrBuf : Buffer.from(JSON.stringify(objOrBuf));
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function signHS256(input, secret) {
  return b64u(crypto.createHmac('sha256', secret).update(input).digest());
}
function makeJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60*60*24*3 }; // 3 dias
  const h = b64u(header);
  const p = b64u(body);
  const s = signHS256(`${h}.${p}`, secret);
  return `${h}.${p}.${s}`;
}

exports.handler = async (event) => {
  try {
    const origin = process.env.SITE_URL || '*';
    const pref = (event.queryStringParameters && event.queryStringParameters.preference_id) || '';

    // MODO TESTE: qualquer preferência que comece com TESTE libera imediatamente
    if (/^TESTE/i.test(pref)) {
      const token = makeJWT({ email: 'teste@exemplo.com', pref }, process.env.ACCESS_TOKEN_SECRET || 'devsecret');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        body: JSON.stringify({ ok: true, token })
      };
    }

    // PRODUÇÃO (placeholder): enquanto não integramos o webhook/banco, sinalize pendente
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      body: JSON.stringify({ ok: false, pending: true })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok:false, error: 'claim-access failed', detail: String(e) })
    };
  }
};
