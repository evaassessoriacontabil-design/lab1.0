// netlify/functions/claim-access.js
const nodeCrypto = require('crypto'); // <- renomeado

function b64u(objOrBuf){
  const b = Buffer.isBuffer(objOrBuf) ? objOrBuf : Buffer.from(JSON.stringify(objOrBuf));
  return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function sign(input, secret){
  return b64u(nodeCrypto.createHmac('sha256', secret || 'devsecret').update(input).digest());
}
function makeJWT(payload, secret){
  const now = Math.floor(Date.now()/1000);
  const header = { alg:'HS256', typ:'JWT' };
  const body = { ...payload, iat: now, exp: now + 60*60*24*7 };
  const h = b64u(header), p = b64u(body), s = sign(`${h}.${p}`, secret);
  return `${h}.${p}.${s}`;
}

exports.handler = async (event) => {
  const origin = process.env.SITE_URL || '*';
  try {
    const pref = event.queryStringParameters?.preference_id || '';
    if (!pref){
      return { statusCode:400, headers:{'Access-Control-Allow-Origin':origin}, body: JSON.stringify({ ok:false, error:'missing preference_id' }) };
    }

    // MODO TESTE: qualquer preferência iniciando por TESTE* libera
    if (/^TESTE/i.test(pref)) {
      const token = makeJWT({ email:'teste@exemplo.com', pref }, process.env.ACCESS_TOKEN_SECRET);
      return { statusCode:200, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:true, token }) };
    }

    // PRODUÇÃO: checa no Netlify Blobs se o pagamento foi marcado como pago
    const { blobs } = await import('@netlify/blobs');
    const paidObj = await blobs.get(`paid/${pref}.json`);
    if (!paidObj){
      return { statusCode:200, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:false, pending:true }) };
    }
    const meta = JSON.parse(await paidObj.text());
    const token = makeJWT({ email: meta.email || '', pref }, process.env.ACCESS_TOKEN_SECRET);

    return { statusCode:200, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:true, token }) };
  } catch (e) {
    return { statusCode:500, headers:{ 'Access-Control-Allow-Origin':origin }, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
