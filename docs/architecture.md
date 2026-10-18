# Architecture

Three paid APIs, one static page:

1. LLM (Gemini, bring-your-own-key) - planning and ranking only. It sees the
   goal, the cap, and the candidate list. It never touches payment.
2. Channel3 Search API - live product catalog: titles, brands, prices,
   availability, merchant domains.
3. PayPal - checkout. The static demo uses the PayPal JS SDK against the
   sandbox (client-side order create/capture, amount locked to the approved
   pick). server/ implements the same flow against the Orders v2 REST API for
   judges who want the server-side pattern.

The mandate (goal, cap, window, issued-at) lives in localStorage. The ledger
subtracts every captured order from the mandate's remaining budget; the agent
refuses to run when the mandate is exhausted.

Trust boundaries, deliberately:
- The LLM never receives payment credentials.
- Keys live only in the browser that entered them (localStorage).
- The purchase amount comes from the approved product object, not from
  anything the LLM said.
