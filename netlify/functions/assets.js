// netlify/functions/assets.js
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

function fromB64u(s){ s = s.replace(/-/g,'+').replace(/_/g,'/'); return Buffer.from(s,'base64').toString('utf8'); }
function signHS256(input, secret){
  return nodeCrypto.createHmac('sha256', secret || 'devsecret')
    .update(input).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function verifyJWT(token, secret){
  try{
    const [h,p,s] = token.split('.');
    if (!h || !p || !s) return false;
    const expect = signHS256(`${h}.${p}`, secret);
    if (s !== expect) return false;
    const payload = JSON.parse(fromB64u(p));
    const now = Math.floor(Date.now()/1000);
    if (payload.exp && payload.exp < now) return false;
    return payload; // ok
  }catch(e){ return false; }
}

function safeJoinProtected(filename){
  // impede ../ e resolve para a pasta empacotada "protected"
  const base = path.join(process.env.LAMBDA_TASK_ROOT || process.cwd(), 'protected');
  const resolved = path.normalize(path.join(base, filename));
  if (!resolved.startsWith(base)) return null; // tentativa de fuga
  return resolved;
}

exports.handler = async (event) => {
  try{
    const origin = process.env.SITE_URL || '*';
    const q = event.queryStringParameters || {};
    const file = (q.file || '').trim();
    const token = (q.token || '').trim();

    if (!file) {
      return { statusCode: 400, headers:{'Access-Control-Allow-Origin':origin}, body: 'missing file' };
    }
    if (!token) {
      return { statusCode: 401, headers:{'Access-Control-Allow-Origin':origin}, body: 'missing token' };
    }

    const payload = verifyJWT(token, process.env.ACCESS_TOKEN_SECRET);
    if (!payload) {
      return { statusCode: 401, headers:{'Access-Control-Allow-Origin':origin}, body: 'invalid token' };
    }

    const full = safeJoinProtected(file);
    if (!full || !fs.existsSync(full)) {
      return { statusCode: 404, headers:{'Access-Control-Allow-Origin':origin}, body: 'not found' };
    }

    const buf = fs.readFileSync(full);
    const ext = path.extname(full).toLowerCase();
    const ctype = ext === '.png' ? 'image/png'
               : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
               : 'application/octet-stream';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': ctype,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': origin
      },
      body: buf.toString('base64'),
      isBase64Encoded: true
    };

  }catch(e){
    return { statusCode: 500, body: 'err ' + String(e) };
  }
};
