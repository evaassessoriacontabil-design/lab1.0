export async function handler(event) {
  try {
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const qs = event.queryStringParameters || {};
    const payment_id = qs.payment_id || qs.collection_id; // MP pode usar ambos

    if (!payment_id) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, reason: "missing payment_id" }) };
    }

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` }
    });
    const pay = await r.json();
    if (!r.ok) return { statusCode: r.status, body: JSON.stringify(pay) };

    const ok = pay?.status === "approved";
    return { statusCode: 200, body: JSON.stringify({ ok, status: pay?.status, amount: pay?.transaction_amount }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
}
