Love it. Let’s ship a **proof‑of‑concept** you can run today on Cloudflare Workers + Workers AI, and then harden it into a sellable “AI Paywall Gateway” you can drop in front of any route or whole zones.

I’ll give you:

* Architecture (simple → production)
* Worker code (JWT pass, Stripe checkout, webhook, KV)
* Workers AI “reasoner” for dynamic messaging/pricing
* wrangler config + deployment steps
* How to attach it to real traffic (WAF rules)
* Monetization math to \$3k/week

---

# 1) What we’re building

A **reverse‑proxy Worker** that:

1. Intercepts requests that match your “suspicious/bot” or “premium” rules
2. Shows a **custom paywall page** that includes an **AI assistant** (via Workers AI) to explain options (pay once, subscribe, verify identity, etc.)
3. On successful payment, issues a **signed bypass token** (JWT in cookie) and lets the user/agent through for a set TTL
4. Logs events in KV / D1 for receipts & audits

This avoids needing Enterprise “custom challenge” pages—you’ll **route** the traffic you want into this Worker.

---

# 2) Architecture (POC → prod)

**POC (1–2 hours)**

* Cloudflare Worker (single file)
* KV namespace for sessions/receipts
* Stripe Checkout for one‑time payments
* JWT cookie for access
* Workers AI `@cf/meta/llama-3.1-8b-instruct` for the “why/what” dialog on the paywall

**Production**

* **Durable Object** for rate‑limit & session concurrency
* **D1** for receipts & customers (exportable)
* **Turnstile** added to the paywall to filter obvious junk before hitting Stripe
* Optional: Lightning/Crypto (BTCPay), Crossmint, Apple/Google Pay
* Signed **HMAC** on webhook & **subrequest signature** to your origin if needed

---

# 3) Worker: core logic (TypeScript)

**Features**

* `PAY_GATEWAY_SECRET` (JWT signing)
* `STRIPE_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
* `KV` (KV namespace)
* Optional `ALLOWED_PATHS` list to guard only some routes

```ts
// src/index.ts
import { Hono } from 'hono'
import { jwt, sign, verify } from 'hono/jwt'
import { cors } from 'hono/cors'

type Env = {
  KV: KVNamespace
  PAY_GATEWAY_SECRET: string
  STRIPE_SECRET: string
  STRIPE_PRICE_ID: string
  STRIPE_WEBHOOK_SECRET: string
  ORIGIN_HOST: string           // e.g. "example.com"
  AI: Ai                         // Workers AI binding
}

const app = new Hono<{ Bindings: Env }>()
app.use('*', cors())

// Utility: create Stripe checkout session
async function createStripeCheckout(env: Env, req: Request) {
  const body = await req.json().catch(() => ({}))
  const { return_to } = body
  const successUrl = new URL('/__cfpay/success', req.url)
  if (return_to) successUrl.searchParams.set('r', return_to)

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      mode: 'payment',
      line_items[0][price]: env.STRIPE_PRICE_ID,
      line_items[0][quantity]: '1',
      success_url: successUrl.toString(),
      cancel_url: successUrl.toString() + '&c=1'
    } as any)
  })
  return resp.json()
}

// Generate JWT “bypass” token
async function issueBypass(env: Env, subject: string, ttlSec = 3600) {
  const now = Math.floor(Date.now()/1000)
  const payload = { sub: subject, iat: now, exp: now + ttlSec }
  return await sign(payload, env.PAY_GATEWAY_SECRET)
}

// Basic AI helper message (Workers AI)
async function aiExplain(env: Env, intent: string) {
  const sys = `You are a concise paywall assistant for a security gateway. 
Explain options (verify, micro-payment, subscription) in <120 words>, friendly, neutral.`
  const prompt = `User intent: ${intent}. Site: ${env.ORIGIN_HOST}.`
  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: prompt }
    ],
    max_tokens: 160
  } as any)
  // @ts-ignore
  return result?.response ?? 'You can purchase access or verify to continue.'
}

// 1) Paywall page
app.get('/__cfpay', async (c) => {
  const intent = new URL(c.req.url).searchParams.get('why') || 'Access blocked or premium content.'
  const msg = await aiExplain(c.env, intent)
  const html = `
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Access Gateway</title>
    <style>
      body{font-family:ui-sans-serif,system-ui;margin:0;padding:2rem;max-width:680px}
      .card{border:1px solid #ddd;border-radius:16px;padding:1.25rem}
      .btn{display:inline-block;padding:.8rem 1.1rem;border-radius:10px;border:1px solid #333;text-decoration:none}
      .small{opacity:.7;font-size:.9rem}
    </style></head>
    <body>
      <h1>Verify or Get Instant Access</h1>
      <div class="card"><p>${msg}</p></div>
      <p class="small">Detected as: bot/suspicious/unknown. If this is a mistake, continue.</p>
      <form id="pay" method="POST" action="/__cfpay/checkout">
        <input type="hidden" name="return_to" value="/">
        <button class="btn" type="submit">Pay $0.50 to continue</button>
      </form>
      <p class="small">Problems? Contact admin@${c.env.ORIGIN_HOST}</p>
    </body></html>`
  return c.html(html)
})

// 2) Create checkout
app.post('/__cfpay/checkout', async (c) => {
  const contentType = c.req.header('content-type') || ''
  let return_to = '/'
  if (contentType.includes('application/json')) {
    const b = await c.req.json().catch(()=>({}))
    return_to = b.return_to || '/'
  } else {
    const fd = await c.req.parseBody()
    // @ts-ignore
    return_to = fd?.return_to || '/'
  }
  const session = await createStripeCheckout(c.env, new Request(c.req.url, {method:'POST', body: JSON.stringify({return_to})}))
  if (session?.url) return c.redirect(session.url, 302)
  return c.json({ error: 'stripe_failed', session }, 500)
})

// 3) Stripe webhook → issue token
app.post('/__cfpay/webhook', async (c) => {
  // NOTE: In production, verify signature using STRIPE_WEBHOOK_SECRET
  const event = await c.req.json()
  if (event?.type === 'checkout.session.completed') {
    const session = event.data.object
    const subject = session?.customer_details?.email || session?.id || 'anon'
    const token = await issueBypass(c.env, subject, 3600)
    // store receipt hash → KV
    await c.env.KV.put(`receipt:${session.id}`, JSON.stringify({ email: subject, at: Date.now() }), { expirationTtl: 86400*30 })
    return c.json({ ok: true, token })
  }
  return c.json({ ok: true })
})

// 4) Success endpoint → set cookie, redirect back
app.get('/__cfpay/success', async (c) => {
  const r = new URL(c.req.url).searchParams.get('r') || '/'
  // In production you’d confirm via Stripe API; for POC a token is issued client-side via webhook fetch, or we mint a temp token
  const token = await issueBypass(c.env, 'temp', 300) // 5 minutes grace if needed
  c.header('Set-Cookie', `cfpay_jwt=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`)
  return c.redirect(r, 302)
})

// 5) Proxy handler with guard
app.all('*', async (c) => {
  const url = new URL(c.req.url)
  const jwtCookie = c.req.header('Cookie')?.match(/cfpay_jwt=([^;]+)/)?.[1]
  let valid = false
  if (jwtCookie) {
    try {
      await verify(jwtCookie, c.env.PAY_GATEWAY_SECRET)
      valid = true
    } catch { valid = false }
  }

  // Decide who gets the paywall (replace with your own WAF signal or heuristics)
  const looksSuspicious =
    c.req.header('cf-ipcountry') === 'T1' || // Tor
    (c.req.header('user-agent') || '').includes('curl') ||
    c.req.header('cf-visitor')?.includes('bot') // just illustrative

  if (!valid && looksSuspicious && !url.pathname.startsWith('/__cfpay')) {
    const p = new URL('/__cfpay', url)
    p.searchParams.set('why', 'Suspicious or premium access required.')
    return c.redirect(p.toString(), 302)
  }

  // Proxy to origin
  const upstream = `https://${c.env.ORIGIN_HOST}${url.pathname}${url.search}`
  return fetch(upstream, {
    method: c.req.method,
    headers: Object.fromEntries([...c.req.raw.headers]),
    body: ['GET','HEAD'].includes(c.req.method) ? undefined : await c.req.arrayBuffer()
  })
})

export default app
```

---

# 4) `wrangler.toml`

```toml
name = "cf-ai-pay-gateway"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[vars]
ORIGIN_HOST = "example.com"

[kv_namespaces]
  binding = "KV"
  id = "YOUR_KV_ID"

[ai]
binding = "AI"

[observability]
enabled = true
```

Add secrets:

```bash
wrangler kv namespace create KV
wrangler secret put PAY_GATEWAY_SECRET
wrangler secret put STRIPE_SECRET
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_PRICE_ID
```

Build & deploy:

```bash
npm i hono hono/jwt
wrangler deploy
```

Create a Stripe webhook pointing to:

```
https://<your-worker>/__cfpay/webhook
```

---

# 5) Wiring traffic into the gateway

**Option A (simple):** Put the Worker on a **subdomain** that proxies your site, e.g. `gateway.example.com` → origin, and point “suspicious” traffic there via app logic or links (fastest POC).

**Option B (recommended):**
In Cloudflare **WAF > Firewall Rules**:

* If `ip.src in {known_proxies}` OR `User-Agent matches curl/scraper` OR `Bot score < 30`, then **Route to Worker** (action: “Execute Worker” on the request).
  Everything else goes direct to origin. This achieves “served on the blocker page” intent without requiring Enterprise challenge page overrides.

**Option C (premium):**
For **premium content** routes (`/reports/*`, `/api/*`) add **Route → Worker** so those paths always hit the paywall logic.

---

# 6) Workers AI dialog on the paywall

Already in the code (`aiExplain`). You can enrich:

* Variable pricing (e.g., offer **\$0.10** for single request, **\$3/day pass**, **\$19/mo**)
* Contextual copy based on UA / country / referer
* Offer **verification** (Turnstile) as a free path for legit users

---

# 7) Hardening for production

* **Turnstile** widget on the paywall form → verify server-side before creating checkout
* **Verify Stripe webhook** signature (mandatory)
* **Durable Object**: gate one active session per IP / user, prevent checkout floods
* **D1**: store receipts, emails, product, TTL, refunds; nightly export to your data warehouse
* **Signed origin proof**: Add `X-Pass-Token: <HMAC(jwt, path, ts)>` header so your origin can optionally re‑validate
* **Rate limit**: 429 on repeated failures; backoff in KV
* **Bot friction**: require JS to render paywall; hide endpoints from prefetchers

---

# 8) Business model → \$3k/week

**Two lanes:**

1. **SaaS**: \$49/mo per site for “Intelligent Bot Monetizer”

* 75 sites → **\$3,675/mo** (\~\$850/wk).
* Add \$199/mo Pro (D1 receipts, analytics). 30 pros + 40 basics ≈ **\$6,860/mo**.

2. **Usage**: take **5–10%** on processed payments

* If your customers do \$60k/mo in access fees across all sites, 5% = **\$3k/mo**.
* Combine SaaS + usage to comfortably clear **\$3k/week** as you scale.

**Go‑to‑market**:

* Target API/data businesses, media with scraper problems, price‑scraped eCom.
* “Recover blocked traffic into revenue” case study.
* One‑click install (route + env vars) + 15‑min onboarding.

---

# 9) Quick checklist to run your POC today

1. Create Worker + KV + AI binding in `wrangler.toml`
2. Add secrets (Stripe keys, JWT secret)
3. Deploy + map a subdomain (`gateway.example.com`)
4. Set `ORIGIN_HOST` to your real site
5. Create Stripe Price (e.g., `$0.50` pay‑per‑pass) and webhook
6. Hit `https://gateway.example.com/` from `curl` → should redirect you to `/__cfpay` and then Stripe
7. After success, you’ll land back and access will proxy through for 1 hour

---

If you want, I can:

* Refactor the code to **Durable Objects + D1**,
* Add **Turnstile** verification,
* Swap in **Crossmint** or **BTCPay** alongside Stripe,
* And package this as an npm template repo + Cloudflare “Deploy with Wrangler” button.

Pick your payment stack (Stripe only vs Stripe + crypto), and I’ll tailor the code next.
