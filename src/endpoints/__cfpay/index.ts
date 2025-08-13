// 1) Paywall page
import { OpenAPIRoute, Str } from 'chanfana'

export class PaywallPageRoute extends OpenAPIRoute {
  static schema = {
    tags: ['ui'],
    summary: 'Human paywall page (HTML)',
    // You can document this in OpenAPI even though it’s HTML
    responses: {
      200: {
        description: 'Rendered HTML paywall page',
        content: {
          'text/html': { schema: { type: 'string', description: 'HTML document' } }
        }
      }
    },
    responses: { 200: { description: 'OK' } }
  }
  async handle(c: any) {
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
    return c.html(html);
  }
}
