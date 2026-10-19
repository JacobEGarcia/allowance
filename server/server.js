// Optional: full PayPal Orders v2 REST flow for judges who want the
// server-side integration. The static demo uses the JS SDK instead.
//
//   cd server && npm install
//   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node server.js
//
// Exposes:
//   POST /api/orders            { description, amount } -> { id }
//   POST /api/orders/:id/capture -> capture result
// Serves ../ (the static app) at http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const BASE = 'https://api-m.sandbox.paypal.com'; // sandbox; swap to api-m.paypal.com for live

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox).');
  process.exit(1);
}

async function accessToken() {
  const res = await fetch(BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('oauth failed: ' + res.status);
  return (await res.json()).access_token;
}

async function api(pathname, method, body) {
  const token = await accessToken();
  const res = await fetch(BASE + pathname, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(pathname + ' -> ' + res.status + ' ' + JSON.stringify(data));
  return data;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/orders') {
    const body = await readJson(req);
    const order = await api('/v2/checkout/orders', 'POST', {
      intent: 'CAPTURE',
      purchase_units: [{
        description: String(body.description || 'Allowance purchase').slice(0, 120),
        amount: { currency_code: 'USD', value: Number(body.amount).toFixed(2) },
      }],
    });
    return sendJson(res, 200, { id: order.id });
  }

  if (req.method === 'POST' && req.url === '/api/search') {
    // Channel3 proxy - the key stays server-side (their API answers preflights
    // with 403, so browsers cannot call it directly).
    if (!process.env.CHANNEL3_API_KEY) return sendJson(res, 500, { error: 'CHANNEL3_API_KEY not set' });
    const body = await readJson(req);
    try {
      const r = await fetch('https://api.trychannel3.com/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CHANNEL3_API_KEY },
        body: JSON.stringify({ query: String(body.query || ''), limit: Math.min(Number(body.limit) || 8, 30), filters: { availability: ['InStock'] } }),
      });
      const data = await r.json();
      return sendJson(res, r.status, data);
    } catch (e) {
      return sendJson(res, 502, { error: String(e) });
    }
  }

  const cap = req.url.match(/^\/api\/orders\/([\w-]+)\/capture$/);
  if (req.method === 'POST' && cap) {
    const result = await api('/v2/checkout/orders/' + cap[1] + '/capture', 'POST');
    return sendJson(res, 200, result);
  }

  // static files
  const file = path.join(__dirname, '..', req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

function readJson(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
  });
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

server.listen(3000, () => console.log('Allowance server on http://localhost:3000 (PayPal sandbox)'));
