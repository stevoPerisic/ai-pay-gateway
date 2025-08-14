// 2) Create checkout
import { OpenAPIRoute, Str } from 'chanfana'

export class CheckoutPageRoute extends OpenAPIRoute {
  static schema = {
    tags: ['ui'],
    summary: 'AI Checkout page (HTML)',
    // You can document this in OpenAPI even though it’s HTML
    responses: {
      200: {
        description: 'Rendered HTML checkout page',
        content: {
          'text/html': { schema: { type: 'string', description: 'HTML document' } }
        }
      }
    },
    responses: { 200: { description: 'OK' } }
  }
  async handle(c: any) {
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
    // const session = await createStripeCheckout(c.env, new Request(c.req.url, {method:'POST', body: JSON.stringify({return_to})}))
    // if (session?.url) return c.redirect(session.url, 302)
    const session = 'Stripe Session placeholder'
    return c.json({ error: 'stripe_failed', session }, 500)
  }
}
