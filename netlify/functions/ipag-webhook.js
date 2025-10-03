// CommonJS
const jwt = require('jsonwebtoken');

module.exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const status = (body.status || '').toLowerCase();
  const email =
    body.email || body.customer_email || body.payer_email || 'sem-email';

  if (!['approved', 'paid', 'authorized'].includes(status)) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignore: true }) };
  }

  const secret = process.env.ACCESS_TOKEN_SECRET;
  const siteUrl = process.env.SITE_URL || 'https://seu-site.netlify.app';
  if (!secret) return { statusCode: 500, body: 'ACCESS_TOKEN_SECRET não configurado' };

  const token = jwt.sign({ email }, secret, { expiresIn: '24h' });
  const link = `${siteUrl}/index.html?token=${token}`;

  return { statusCode: 200, body: JSON.stringify({ ok: true, token, link }) };
};
