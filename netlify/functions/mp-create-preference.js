// netlify/functions/mp-create-preference.js
// Cria uma preferência NOVA no Mercado Pago a cada clique.
// Requer envs: MP_ACCESS_TOKEN, SITE_URL
const site = process.env.SITE_URL || 'https://labnivel.netlify.app';

exports.handler = async () => {
  try {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      return { statusCode: 500, body: JSON.stringify({ error: 'MP_ACCESS_TOKEN ausente' }) };
    }

    // corpo da preferência (Checkout Pro)
    const body = {
      items: [
        { title: 'Ativar Jogo – Laboratório 1.0', quantity: 1, unit_price: 29.90, currency_id: 'BRL' }
      ],
      binary_mode: true,
      auto_return: 'approved',
      notification_url: `${site}/.netlify/functions/mp-webhook`,
      back_urls: {
        success: `${site}/acesso.html`,
        pending: `${site}/acesso.html`,
        failure: `${site}/index.html#falhou`
      },
      // opcionalmente: expires/expiration_date_from/_to
      statement_descriptor: 'LABNIVEL'
    };

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json();

    if (!resp.ok || !data.init_point) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Falha ao criar preferência', detail: data }) };
    }

    // devolvemos init_point (link do checkout) e o preference_id
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, init_point: data.init_point, preference_id: data.id })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'exception', detail: String(e) }) };
  }
};
