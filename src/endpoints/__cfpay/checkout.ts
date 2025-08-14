import { OpenAPIRoute, Str } from 'chanfana'

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
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      success_url: successUrl.toString(),
      cancel_url: successUrl.toString() + '&c=1'
    } as any)
  })
  return resp.json()
}

export class CheckoutPageRoute extends OpenAPIRoute {
  static schema = {
    tags: ['ui'],
    summary: 'AI Checkout page (HTML)',
    description:
      'Handles creation of a checkout session. For HTML clients, serves a human checkout page. For API clients, returns JSON session info.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                return_to: Str({ description: 'Path or URL to redirect after payment', example: '/' })
              }
            }
          },
          'application/x-www-form-urlencoded': {
            schema: {
              type: 'object',
              properties: {
                return_to: Str({ description: 'Path or URL to redirect after payment', example: '/' })
              }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'HTML checkout page or JSON session response',
        content: {
          'text/html': {
            schema: {
              type: 'string',
              description: 'Rendered HTML checkout page'
            }
          },
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: Str({ example: 'stripe_failed' }),
                session: { type: 'string', example: 'Stripe Session placeholder' }
              }
            }
          }
        }
      },
      500: {
        description: 'Stripe session creation failed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: Str({ example: 'stripe_failed' }),
                session: { type: 'string', example: 'null or placeholder' }
              }
            }
          }
        }
      }
    }
  }

  async handle(c: any) {
    const contentType = c.req.header('content-type') || ''
    let return_to = '/'

    if (contentType.includes('application/json')) {
      const b = await c.req.json().catch(() => ({}))
      return_to = b.return_to || '/'
    } else {
      const fd = await c.req.parseBody()
      // @ts-ignore
      return_to = fd?.return_to || '/'
    }

    // Stripe integration
    try {
      const session = await createStripeCheckout(c.env, new Request(c.req.url, { method: 'POST', body: JSON.stringify({ return_to }) }))
      if (session?.url) return c.redirect(session.url, 302)
      return c.json({ error: 'stripe_failed', session }, 500)
    } catch (e) {
      return c.json({ error: 'stripe_failed', session: null }, 500)
    }
  }
}
