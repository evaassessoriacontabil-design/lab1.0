// netlify/functions/mp-create-preference.js

exports.handler = async () => {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    const siteUrl = process.env.SITE_URL || 'https://labnivel.netlify.app';

    if (!accessToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'MP_ACCESS_TOKEN ausente' })
      };
    }

    const prefBody = {
      items: [
        {
          title: 'Ativação do Jogo Laboratório Contábil',
          quantity: 1,
          unit_price: 29.9,
          currency_id: 'BRL'
        }
      ],
      back_urls: {
        success: `${siteUrl}/acesso.html`,
        failure: `${siteUrl}/acesso.html`,
        pending: `${siteUrl}/acesso.html`
      },
      auto_return: 'approved',
      notification_url: `${siteUrl}/.netlify/functions/mp-webhooks`,
      statement_descriptor: 'LABNIVEL',
      external_reference: 'labnivel-' + Date.now()
    };

    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prefBody)
    });

    const data = await r.json();

    if (r.ok && data && data.id && data.init_point) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          preference_id: data.id,
          init_point: data.init_point
        })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: data || 'Erro ao criar preferência' })
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
