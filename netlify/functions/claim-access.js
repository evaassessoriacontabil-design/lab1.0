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
// netlify/functions/claim-access.js
const crypto = require('crypto');

// util pra JWT HS256
function b64u(objOrBuf){ const buf = Buffer.isBuffer(objOrBuf) ? objOrBuf : Buffer.from(JSON.stringify(objOrBuf)); return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function signHS256(input, secret){ return b64u(crypto.createHmac('sha256', secret).update(input).digest()); }
function makeJWT(payload, secret){
  const now = Math.floor(Date.now()/1000);
  const header = { alg:'HS256', typ:'JWT' };
  const body = { ...payload, iat: now, exp: now + 60*60*24*7 }; // 7 dias
  const h = b64u(header), p = b64u(body), s = signHS256(`${h}.${p}`, secret);
  return `${h}.${p}.${s}`;
}

exports.handler = async (event) => {
  const origin = process.env.SITE_URL || '*';
  try{
    const pref = event.queryStringParameters?.preference_id || '';
    if (!pref) {
      return { statusCode: 400, headers:{'Access-Control-Allow-Origin':origin}, body: JSON.stringify({ ok:false, error:'missing preference_id' }) };
    }

    // modo teste (ajuda quando quer validar fluxo sem pagar)
    if (/^TESTE/i.test(pref)) {
      const token = makeJWT({ email: 'teste@exemplo.com', pref }, process.env.ACCESS_TOKEN_SECRET || 'devsecret');
      return { statusCode:200, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:true, token }) };
    }

    const store = await import('@netlify/blobs');
    const blobs = store.blobs;

    const paid = await blobs.get(`paid/${pref}.json`);
    if (!paid) {
      return { statusCode:200, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:false, pending:true }) };
    }

    const meta = JSON.parse(await paid.text());
    const token = makeJWT({ email: meta.email || '', pref }, process.env.ACCESS_TOKEN_SECRET || 'devsecret');

    return { statusCode:200, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:true, token }) };

  }catch(e){
    return { statusCode:500, headers:{ 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
