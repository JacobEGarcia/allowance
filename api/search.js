// Vercel serverless function: Channel3 search proxy.
// The Channel3 API answers CORS preflights with 403, so browsers can't call
// it directly. The API key lives in the CHANNEL3_API_KEY env var, server-side.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.CHANNEL3_API_KEY) return res.status(500).json({ error: 'CHANNEL3_API_KEY not set' });

  const { query, limit } = req.body || {};
  try {
    const r = await fetch('https://api.trychannel3.com/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CHANNEL3_API_KEY },
      body: JSON.stringify({
        query: String(query || ''),
        limit: Math.min(Number(limit) || 8, 30),
        filters: { availability: ['InStock'] },
      }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
}
