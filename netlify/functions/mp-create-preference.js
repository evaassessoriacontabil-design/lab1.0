export async function handler(event) {
  try {
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SITE_URL = process.env.SITE_URL || "https://labnivel.netlify.app";
    const body = JSON.parse(event.body || "{}");
    const amount = Number(body.amount || 29.9);

    const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [{ title: "Ativar Jogo Lab Nível", quantity: 1, unit_price: amount, currency_id: "BRL" }],
        back_urls: {
          success: `${SITE_URL}/sucesso.html`,
          failure: `${SITE_URL}/erro.html`,
          pending: `${SITE_URL}/pendente.html`
        },
        auto_return: "approved",
        notification_url: `${SITE_URL}/.netlify/functions/mp-webhooks`,
        binary_mode: true,
        statement_descriptor: "LABNIVEL"
      })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(JSON.stringify(data));
    return { statusCode: 200, body: JSON.stringify({ init_point: data.init_point, preference_id: data.id }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}{ "ok": true, "preference_id": "<id>", "init_point": "<url>" }
