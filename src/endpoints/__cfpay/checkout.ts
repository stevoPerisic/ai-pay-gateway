import { OpenAPIRoute, Str } from 'chanfana'

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

    // Stripe integration placeholder
    // const session = await createStripeCheckout(c.env, new Request(c.req.url, { method: 'POST', body: JSON.stringify({ return_to }) }))
    // if (session?.url) return c.redirect(session.url, 302)

    const session = 'Stripe Session placeholder'
    return c.json({ error: 'stripe_failed', session }, 500)
  }
}
