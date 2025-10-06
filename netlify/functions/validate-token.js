// CommonJS
const jwt = require('jsonwebtoken');

module.exports.handler = async (event) => {
  const token = (event.queryStringParameters && event.queryStringParameters.token) || '';
  const secret = process.env.ACCESS_TOKEN_SECRET;
  const site   = process.env.SITE_URL || 'https://labnivel.netlify.app';

  if (!secret) {
    return { statusCode: 500, body: JSON.stringify({ valido:false, error:'ACCESS_TOKEN_SECRET não configurado' }) };
  }

  try {
    const data = jwt.verify(token, secret);
    // trava por domínio/aplicação
    if (data.aud !== 'labnivel' || (data.origin && data.origin !== site)) {
      return { statusCode: 200, body: JSON.stringify({ valido:false }) };
    }
    return { statusCode: 200, body: JSON.stringify({ valido:true }) };
  } catch {
    return { statusCode: 200, body: JSON.stringify({ valido:false }) };
  }
};
