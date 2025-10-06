const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

module.exports.handler = async (event) => {
  try{
    const { token, file } = event.queryStringParameters || {};
    const secret = process.env.ACCESS_TOKEN_SECRET;
    const site   = process.env.SITE_URL || 'https://labnivel.netlify.app';
    if (!token || !secret) return { statusCode:403, body:'forbidden' };

    const data = jwt.verify(token, secret);
    if (data.aud !== 'labnivel' || (data.origin && data.origin !== site)) {
      return { statusCode:403, body:'forbidden' };
    }

    // imagens ficam em /protected/<file>
    const p = path.join(process.cwd(), 'protected', file || '');
    if (!p.startsWith(path.join(process.cwd(), 'protected'))) return { statusCode:400, body:'bad path' };
    if (!fs.existsSync(p)) return { statusCode:404, body:'not found' };

    const buf = fs.readFileSync(p);
    const ext = path.extname(p).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    return {
      statusCode:200,
      headers:{'Content-Type':type,'Cache-Control':'private, max-age=3600'},
      body:buf.toString('base64'),
      isBase64Encoded:true
    };
  }catch(e){
    return { statusCode:403, body:'forbidden' };
  }
};
