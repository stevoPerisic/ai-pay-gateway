import { OpenAPIRoute } from 'chanfana'

export class PaywallPageRoute extends OpenAPIRoute {
  static schema = {
    tags: ['ui'],
    summary: 'Human paywall page (HTML)',
    description:
      'Serves a human-readable paywall page prompting the user to purchase or verify access.',
    responses: {
      200: {
        description: 'Rendered HTML paywall page',
        content: {
          'text/html': {
            schema: {
              type: 'string',
              description: 'HTML document containing the paywall UI'
            }
          }
        }
      }
    }
  }

  // Use a class method, not a function declaration
  async aiExplain(env: any, intent: string) {
    // Model example: @cf/meta/llama-3.1-8b-instruct
    const res: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a concise site helper.' },
        { role: 'user', content: `Explain in <120 words why access is gated. Reason: ${intent}` }
      ],
      max_tokens: 160
    })
    return (res && res.response) ? String(res.response) : 'You can purchase access or verify to continue.'
  }
  
  async handle(c: any) {
    const intent = new URL(c.req.url).searchParams.get('why') || 'Access blocked or premium content.'
    const msg = await this.aiExplain(c.env, intent)
    // Removed duplicate const msg = 'Test PaywallPageRoute'
    const originHost = (c.env && c.env.ORIGIN_HOST) ? c.env.ORIGIN_HOST : 'example.com'
    const html = `<!doctype html><html><head><meta charset="utf-8">
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
      <p class="small">Problems? Contact admin@${originHost}</p>
    </body></html>`

    // Ensure c.html exists, otherwise use new Response
    if (typeof c.html === 'function') {
      return c.html(html)
    }
    return new Response(html, { headers: { 'Content-Type': 'text/html' }})
  }
}
