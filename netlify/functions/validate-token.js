// netlify/functions/validate-token.js
const crypto = require('crypto');

function fromB64u(s){ s = s.replace(/-/g,'+').replace(/_/g,'/'); return Buffer.from(s, 'base64').toString('utf8'); }
function signHS256(input, secret){
  return crypto.createHmac('sha256', secret).update(input).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

exports.handler = async (event) => {
  const origin = process.env.SITE_URL || '*';
  try{
    const token = (event.queryStringParameters && event.queryStringParameters.token) || '';
    if(!token || token.split('.').length !== 3) throw new Error('missing token');

    const [h,p,s] = token.split('.');
    const secret = process.env.ACCESS_TOKEN_SECRET || 'devsecret';
    const expect = signHS256(`${h}.${p}`, secret);
    if (s !== expect) throw new Error('bad signature');

    const payload = JSON.parse(fromB64u(p));
    const now = Math.floor(Date.now()/1000);
    if (payload.exp && payload.exp < now) throw new Error('expired');

    return {
      statusCode: 200,
      headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': origin },
      body: JSON.stringify({ valido: true, email: payload.email || '' })
    };
  }catch(e){
    return {
      statusCode: 200,
      headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': origin },
      body: JSON.stringify({ valido: false })
    };
  }
};
