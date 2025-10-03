const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  const token =
    (event.queryStringParameters && event.queryStringParameters.token) || '';
  const secret = process.env.ACCESS_TOKEN_SECRET;

  if (!secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ valido: false, error: 'ACCESS_TOKEN_SECRET não configurado' }),
    };
  }

  try {
    jwt.verify(token, secret);
    return { statusCode: 200, body: JSON.stringify({ valido: true }) };
  } catch {
    return { statusCode: 200, body: JSON.stringify({ valido: false }) };
  }
};
