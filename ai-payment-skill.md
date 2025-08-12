Give agents a **machine‑readable paywall** and a **skill/tool** that knows how to complete it. Then it’s automatic.

Here’s the clean way to do it.

# 1) Agent ↔ Gateway handshake (make it machine‑readable)

Teach the gateway to present a **standardized “payment challenge.”** When traffic looks bot/agent-y, respond with:

* **HTTP 402 Payment Required**
* **Problem+JSON body** describing options
* **Link headers** to the payment OpenAPI + well-known descriptor
* A short‑lived **challenge\_id**

**Example 402 response**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json
Link: <https://gateway.example.com/.well-known/agent-paywall>; rel="paywall"
Link: <https://gateway.example.com/openapi.json>; rel="service-desc"
Agent-Challenge: v1 challenge_id=abc123; expires=2025-08-09T20:13:14Z
```

```json
{
  "type": "https://gateway.example.com/errors/payment-required",
  "title": "Payment or verification required",
  "detail": "Choose a pass to continue.",
  "challenge_id": "abc123",
  "options": [
    {"id":"one_time_50c","kind":"one_time","amount_cents":50,"ttl_seconds":3600},
    {"id":"day_pass_3","kind":"one_time","amount_cents":300,"ttl_seconds":86400},
    {"id":"sub_basic","kind":"subscription","amount_cents":1900,"interval":"month"}
  ],
  "payment_methods": ["stripe_card","lightning","wallet_x"],
  "post_payment_token": {"format":"jwt_cookie","cookie_name":"cfpay_jwt"},
  "return_to": "https://origin.example.com/requested/path?qs=...",
  "terms_url": "https://gateway.example.com/terms"
}
```

Agents see **402 + schema** → call your **payment API** → receive token → retry original URL.

Also expose a **well‑known** machine descriptor:

```
GET /.well-known/agent-paywall
{
  "version": "1",
  "service": "cf-ai-pay-gateway",
  "service_desc": "https://gateway.example.com/openapi.json",
  "token_format": "jwt_cookie",
  "cookie_name": "cfpay_jwt",
  "support": "mailto:admin@example.com"
}
```

# 2) Publish a tiny OpenAPI for the gateway

Agents love OpenAPI. Ship this with the Worker:

* `POST /api/payment/checkout` → returns a **payment\_url** (human) or **client\_secret** (programmatic)
* `POST /api/payment/confirm` → for methods you can confirm server‑to‑server (Lightning, wallet, credits)
* `POST /api/payment/redeem` → exchange **challenge\_id** for **access\_token** (JWT) once paid
* `GET /api/payment/status?challenge_id=...`

Keep responses small and deterministic.

# 3) Build the agent “skill/tool” (yes)

Give agents a first‑class tool so they can pay without you.

## A) MCP tool (works with Goose, your preferred stack)

**tool name:** `paywall.pass`

```json
{
  "name": "paywall.pass",
  "description": "Complete a paywall challenge and return an access token/cookie.",
  "input_schema": {
    "type":"object",
    "properties":{
      "gateway_base":{"type":"string","description":"Gateway base URL"},
      "challenge_id":{"type":"string"},
      "option_id":{"type":"string","description":"Price option to buy"},
      "budget_cents":{"type":"integer"},
      "payment_method":{"type":"string","enum":["stripe_card","lightning","wallet_x"]},
      "intent":{"type":"string","description":"Why you need access (for logging/pricing)"}
    },
    "required":["gateway_base","challenge_id","option_id","budget_cents","payment_method"]
  }
}
```

**Behavior:**

1. Calls `/api/payment/checkout` with `challenge_id`, `option_id`, `intent`.
2. If programmatic, completes payment (e.g., client secret + stored org card/credits).
3. Calls `/api/payment/redeem` → returns `{ token, cookie_name, expires_at }`.
4. Tool output: `{ "set_cookie": "cfpay_jwt=…; Path=/; Secure; HttpOnly", "expires_at":"…" }`.

You can ship this tool with **policy controls** (allowlist domains, daily budget cap, max per‑site price).

## B) LangChain tool (Python sketch)

```python
from typing import Optional
import requests

def paywall_pass(gateway_base:str, challenge_id:str, option_id:str,
                 budget_cents:int, payment_method:str, intent:Optional[str]=None):
    # 1) checkout
    r = requests.post(f"{gateway_base}/api/payment/checkout", json={
        "challenge_id": challenge_id,
        "option_id": option_id,
        "payment_method": payment_method,
        "intent": intent,
    }, timeout=15)
    r.raise_for_status()
    data = r.json()
    # assume programmatic confirm path for demo:
    conf = requests.post(f"{gateway_base}/api/payment/confirm", json={
        "challenge_id": challenge_id,
        "payment_token": data.get("payment_token")
    }, timeout=15)
    conf.raise_for_status()

    # 2) redeem → get token/cookie
    rr = requests.post(f"{gateway_base}/api/payment/redeem", json={"challenge_id": challenge_id}, timeout=10)
    rr.raise_for_status()
    return rr.json()  # { set_cookie, cookie_name, expires_at }
```

# 4) Worker tweaks to support agents

Add/adjust in your Cloudflare Worker:

* **Detect agents**: if `User-Agent` contains `Agent/`, or `Accept: application/json`, or a custom header like `Agent-Capabilities: paywall-v1`, return **402 JSON** instead of HTML.
* **Include `Retry-After`** if the agent should wait while payment settles (e.g., Lightning).
* **Idempotency**: accept repeated `redeem`/`status` calls for same `challenge_id`.

Pseudo (within your Worker):

```ts
const wantsJSON = req.headers.get('accept')?.includes('application/json') ||
                  req.headers.get('agent-capabilities')?.includes('paywall-v1')
if (wantsJSON && shouldGate) {
  return json402(problemDoc) // your 402 builder w/ options + challenge_id
}
```

# 5) Controls & safety (don’t let agents go wild)

* **Org wallet / credits**: give each agent an internal balance; the tool spends from that, not raw cards.
* **Per‑domain allowlist**: `allowed_paywall_domains = ["gateway.example.com", "pay.acme.com"]`
* **Budget caps**: `max_cents_per_txn`, `max_cents_per_day`, `max_concurrent_txn`
* **Human escalation**: if > cap, tool returns “need approval” with a deep link.
* **Receipts & audit**: log `{agent_id, domain, option_id, amount, challenge_id}` to D1.

# 6) Practical flows you’ll see in the wild

* **Crawler/Agent hits resource** → 402 JSON (with `challenge_id`)
* Agent calls `paywall.pass` with **budget** and **intent** (e.g., “fetch product prices for client X”)
* Payment completes (credits or programmatic Stripe)
* Agent sets cookie → retries → success
* Token expires → agent decides whether to renew

# 7) Developer experience for site owners

* They install your Cloudflare app / Worker route.
* They toggle **“Agent Payments: On.”**
* They pick prices & TTLs per path (`/api/*` 10¢/100 requests; `/report/*` \$1/day pass).
* Your OpenAPI is exposed automatically. Agents that support **paywall‑v1** “just work.”

# 8) What to build next (fast path)

1. **Add the 402 JSON path** + `/.well-known/agent-paywall` to the Worker you already have.
2. **Publish OpenAPI** (+ minimal `/checkout`, `/redeem`, `/status`).
3. **Ship an MCP tool** (`paywall.pass`) with budget caps + allowlist.
4. **Dogfood**: run your own Goose/agent against a gated demo route and watch it pay & pass.

If you want, I’ll:

* Extend the Worker you have to emit the **402 JSON challenge** and **well‑known** endpoint,
* Generate the **OpenAPI** file,
* And scaffold the **MCP tool** (TS or Python) with budget controls and a small test harness.
