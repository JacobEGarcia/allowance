/* Allowance - agentic commerce with a spending mandate.
   LLM plans, Channel3 searches, PayPal pays. Static site, no build. */

const LS = {
  get(k, d) { try { const v = localStorage.getItem('allowance:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { localStorage.setItem('allowance:' + k, JSON.stringify(v)); }
};

const state = {
  mandate: LS.get('mandate', null),
  ledger: LS.get('ledger', []),
  pick: null,
};

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n).toFixed(2);

/* ---------- settings ---------- */
function loadSettings() {
  $('ch3-key').value = LS.get('ch3Key', '');
  $('llm-key').value = LS.get('llmKey', '');
  $('pp-client').value = LS.get('ppClient', '');
}
$('save-settings').addEventListener('click', () => {
  LS.set('ch3Key', $('ch3-key').value.trim());
  LS.set('llmKey', $('llm-key').value.trim());
  LS.set('ppClient', $('pp-client').value.trim());
  $('save-settings').textContent = 'Saved';
  setTimeout(() => ($('save-settings').textContent = 'Save settings'), 1200);
});

/* ---------- mandate ---------- */
function renderMandate() {
  const el = $('mandate-card');
  if (!state.mandate) { el.classList.add('hidden'); return; }
  const m = state.mandate;
  const remaining = m.cap - state.ledger.filter(e => e.mandateId === m.id).reduce((s, e) => s + e.amount, 0);
  m.remaining = Math.max(0, remaining);
  el.classList.remove('hidden');
  el.innerHTML =
    '<div class="cap">' + money(m.remaining) + ' <span style="font-size:14px;color:var(--muted)">left of ' + money(m.cap) + '</span></div>' +
    '<div>Goal: <strong>' + escapeHtml(m.goal) + '</strong></div>' +
    '<div>Window: ' + m.windowDays + ' days &middot; issued ' + new Date(m.issuedAt).toLocaleString() + '</div>' +
    '<div style="color:var(--muted);font-size:12px;margin-top:4px">Mandate ' + m.id + ' &middot; the agent holds no card details, only this cap.</div>';
  $('agent-section').classList.remove('hidden');
}

$('issue-mandate').addEventListener('click', () => {
  const goal = $('goal').value.trim();
  const cap = parseFloat($('cap').value);
  const windowDays = parseInt($('window').value, 10);
  if (!goal || !(cap > 0) || !(windowDays > 0)) { alert('Set a goal, a cap and a window.'); return; }
  state.mandate = { id: 'M-' + Date.now().toString(36).toUpperCase(), goal, cap, windowDays, issuedAt: Date.now() };
  LS.set('mandate', state.mandate);
  renderMandate();
});

/* ---------- agent ---------- */
function logStep(title, detail) {
  const li = document.createElement('li');
  li.innerHTML = escapeHtml(title) + (detail ? '<div class="step-detail">' + escapeHtml(detail) + '</div>' : '');
  $('agent-log').appendChild(li);
}

const DEMO_PRODUCTS = [
  { title: 'Amber Glass Banker Desk Lamp', brand: 'Brightech', price: 39.99, currency: 'USD', url: 'https://example.com/banker-lamp', domain: 'demo.catalog', image: '' },
  { title: 'Dimmable Warm LED Task Lamp, 2700K', brand: 'Lepower', price: 27.49, currency: 'USD', url: 'https://example.com/task-lamp', domain: 'demo.catalog', image: '' },
  { title: 'Ceramic Table Lamp, Linen Shade', brand: 'Simple Designs', price: 34.95, currency: 'USD', url: 'https://example.com/ceramic-lamp', domain: 'demo.catalog', image: '' },
  { title: 'Mid-Century Wood Tripod Lamp', brand: 'Adesso', price: 58.00, currency: 'USD', url: 'https://example.com/tripod-lamp', domain: 'demo.catalog', image: '' },
];

async function llmPlan(goal, cap) {
  const key = LS.get('llmKey', '');
  const prompt =
    'You are a shopping agent with a strict budget of $' + cap + '. ' +
    'The user goal: "' + goal + '". ' +
    'Reply with ONLY JSON: {"queries": ["...","..."], "max_price": number}. ' +
    'queries: 2 short product-search queries. max_price: the most you may pay for one item, within budget.';
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) throw new Error('LLM request failed (' + res.status + ')');
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM did not return JSON');
  const plan = JSON.parse(m[0]);
  plan.max_price = Math.min(Number(plan.max_price) || cap, cap);
  return plan;
}

async function llmPick(goal, cap, products) {
  const key = LS.get('llmKey', '');
  const list = products.map((p, i) => i + '. ' + p.title + ' | ' + p.brand + ' | $' + p.price + ' | ' + p.domain).join('\n');
  const prompt =
    'You are a shopping agent. Goal: "' + goal + '". Budget cap $' + cap + '.\n' +
    'Candidates:\n' + list + '\n' +
    'Pick the single best option within budget. Reply with ONLY JSON: {"index": number, "rationale": "one sentence"}.';
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) throw new Error('LLM request failed (' + res.status + ')');
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM did not return JSON');
  return JSON.parse(m[0]);
}

async function channel3Search(query, limit) {
  const key = LS.get('ch3Key', '');
  const res = await fetch('https://api.trychannel3.com/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ query, limit, filters: { availability: ['InStock'] } })
  });
  if (!res.ok) throw new Error('Channel3 search failed (' + res.status + ')');
  const data = await res.json();
  return (data.products || []).map(p => {
    const offer = (p.offers || [])[0] || {};
    return {
      title: p.title || 'Untitled',
      brand: (p.brands && p.brands[0] && p.brands[0].name) || '',
      price: offer.price ? offer.price.price : null,
      currency: offer.price ? (offer.price.currency || 'USD') : 'USD',
      url: offer.url || '',
      domain: offer.domain || '',
      image: (p.images && p.images[0]) || '',
    };
  }).filter(p => typeof p.price === 'number');
}

$('run-agent').addEventListener('click', async () => {
  if (!state.mandate) { alert('Issue a mandate first.'); return; }
  const demo = $('demo-mode').checked;
  $('agent-log').innerHTML = '';
  $('approval-card').classList.add('hidden');
  $('checkout-section').classList.add('hidden');
  const m = state.mandate;
  const spent = state.ledger.filter(e => e.mandateId === m.id).reduce((s, e) => s + e.amount, 0);
  const remaining = m.cap - spent;
  if (remaining <= 0) { logStep('Mandate exhausted.', ''); return; }

  try {
    let products, rationale, pick;
    if (demo) {
      logStep('Plan (demo): 2 queries, max price ' + money(Math.min(remaining, 45)), 'demo mode - canned catalog');
      products = DEMO_PRODUCTS.filter(p => p.price <= remaining);
      pick = products[1] || products[0];
      rationale = 'Best warmth-per-dollar: 2700K dimmable LED under the cap, strong reviews pattern for late-night reading.';
      logStep('Searched catalog: ' + products.length + ' in-budget candidates', '');
    } else {
      logStep('Planning searches with the LLM...', 'goal + cap in, JSON plan out');
      const plan = await llmPlan(m.goal, remaining);
      logStep('Plan: ' + plan.queries.map(q => '"' + q + '"').join(', ') + ' - max ' + money(plan.max_price), '');
      products = [];
      for (const q of plan.queries.slice(0, 3)) {
        const found = await channel3Search(q, 8);
        logStep('Channel3: "' + q + '" - ' + found.length + ' in-stock results', '');
        products = products.concat(found);
      }
      const seen = new Set();
      products = products.filter(p => { const k = p.title + p.price; if (seen.has(k)) return false; seen.add(k); return p.price <= remaining; });
      if (!products.length) { logStep('No in-budget products found. Mandate untouched.', ''); return; }
      logStep('Ranking ' + products.length + ' candidates with the LLM...', '');
      const ranked = await llmPick(m.goal, remaining, products.slice(0, 10));
      pick = products[Math.min(Math.max((ranked.index || 1) - 1, 0), products.length - 1)];
      rationale = ranked.rationale || '';
    }
    state.pick = pick;
    showApproval(pick, rationale);
  } catch (err) {
    logStep('Stopped: ' + err.message, 'check Settings, or tick Demo mode');
  }
});

function showApproval(p, rationale) {
  const el = $('approval-card');
  el.classList.remove('hidden');
  el.innerHTML =
    (p.image ? '<img src="' + escapeHtml(p.image) + '" alt="">' : '') +
    '<div class="info">' +
    '<h3>' + escapeHtml(p.title) + '</h3>' +
    '<div class="muted">' + escapeHtml(p.brand) + (p.domain ? ' &middot; ' + escapeHtml(p.domain) : '') + '</div>' +
    '<div class="price">' + money(p.price) + '</div>' +
    (rationale ? '<div class="rationale">Agent rationale: ' + escapeHtml(rationale) + '</div>' : '') +
    '<div class="actions"><button class="primary" id="approve-pick">Approve ' + money(p.price) + '</button><button id="reject-pick">Reject</button></div>' +
    '</div>';
  $('approve-pick').addEventListener('click', () => startCheckout(p));
  $('reject-pick').addEventListener('click', () => {
    el.classList.add('hidden');
    logStep('Pick rejected by the human. Nothing spent.', '');
  });
}

/* ---------- PayPal checkout ---------- */
function startCheckout(p) {
  const clientId = LS.get('ppClient', '');
  if (!clientId) { alert('Add your PayPal sandbox client ID in Settings (free at developer.paypal.com).'); return; }
  $('checkout-section').classList.remove('hidden');
  $('paypal-summary').innerHTML = 'Approved: <strong>' + escapeHtml(p.title) + '</strong> - ' + money(p.price) + ' (sandbox)';
  $('paypal-button-container').innerHTML = '';
  const s = document.createElement('script');
  s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) + '&currency=USD&intent=capture&components=buttons';
  s.onload = () => {
    window.paypal.Buttons({
      createOrder: (data, actions) => actions.order.create({
        purchase_units: [{ description: p.title.slice(0, 120), amount: { value: p.price.toFixed(2), currency_code: 'USD' } }]
      }),
      onApprove: async (data, actions) => {
        const details = await actions.order.capture();
        recordPurchase(p, details);
      },
      onError: (err) => logStep('PayPal error: ' + err, '')
    }).render('#paypal-button-container');
  };
  document.body.appendChild(s);
  $('checkout-section').scrollIntoView({ behavior: 'smooth' });
}

function recordPurchase(p, details) {
  const entry = {
    mandateId: state.mandate.id,
    title: p.title,
    amount: p.price,
    orderId: details.id || (details.purchase_units && details.purchase_units[0] && details.purchase_units[0].payments && details.purchase_units[0].payments.captures && details.purchase_units[0].payments.captures[0].id) || 'unknown',
    payer: details.payer && details.payer.email_address ? details.payer.email_address : 'sandbox buyer',
    at: Date.now(),
  };
  state.ledger.push(entry);
  LS.set('ledger', state.ledger);
  renderLedger();
  renderMandate();
  $('checkout-section').classList.add('hidden');
  $('approval-card').classList.add('hidden');
  logStep('Paid ' + money(p.price) + ' via PayPal. Order ' + entry.orderId + '. Ledger updated.', '');
}

/* ---------- ledger (AG Grid) ---------- */
let ledgerGrid = null;
function renderLedger() {
  const rows = state.ledger.map(e => ({
    item: e.title, amount: e.amount, order: e.orderId,
    mandate: e.mandateId, when: new Date(e.at).toLocaleString()
  }));
  $('ledger-empty').classList.toggle('hidden', rows.length > 0);
  if (!ledgerGrid && window.agGrid) {
    ledgerGrid = agGrid.createGrid($('ledger-grid'), {
      columnDefs: [
        { field: 'item', headerName: 'Item', flex: 3 },
        { field: 'amount', headerName: 'Amount', flex: 1, valueFormatter: p => money(p.value) },
        { field: 'order', headerName: 'PayPal order', flex: 2 },
        { field: 'mandate', headerName: 'Mandate', flex: 1 },
        { field: 'when', headerName: 'When', flex: 2 },
      ],
      rowData: [],
      domLayout: 'normal',
    });
  }
  if (ledgerGrid) ledgerGrid.setGridOption('rowData', rows);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- boot ---------- */
loadSettings();
renderMandate();
renderLedger();
