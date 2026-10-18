# Allowance

Give your AI agent a budget, not your card.

Allowance is an agentic-commerce prototype: you hand an AI shopping agent a
spending mandate (a budget cap, a time window, a goal in plain English), and it
plans, searches real product catalogs, compares options, and checks out with
PayPal - but only after you approve the exact purchase. Every dollar it spends
is tracked against the mandate it was given.

Built for the PayPal AI Hackathon (Devpost), Nov 2026.

## Why

AI agents are starting to buy things for people. Today the only safe way to let
one pay is to not let it pay at all. Allowance shows the middle path: a
machine-readable spending mandate, an approval gate on every purchase, and a
ledger that keeps the agent honest.

## Stack

- PayPal JavaScript SDK (sandbox) for checkout, with an optional Node
  server implementing the Orders v2 REST API end to end.
- Channel3 product-search API for live catalog results.
- A bring-your-own-key LLM (Gemini or OpenRouter) for the shopping plan and
  pick rationale. Keys stay in your browser's localStorage.
- Static site, no build step. Hosted demo on GitHub Pages.

## Run it

1. Open the hosted demo (link in the About section) or serve this folder
   locally (`python3 -m http.server`).
2. In Settings, paste a Channel3 API key (free at trychannel3.com) and a
   Gemini API key (free at aistudio.google.com).
3. Set a mandate: budget cap and a goal ("a desk lamp under $40").
4. Approve or reject the agent's pick. Checkout uses PayPal sandbox.

## Repo layout

- `index.html`, `app.js`, `styles.css` - the app
- `server/` - optional Node server for the full Orders v2 REST flow
- `docs/` - demo script and architecture notes

## License

MIT - see LICENSE.
