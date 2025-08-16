// 3) Stripe webhook → issue token
import { OpenAPIRoute, Str } from 'chanfana';
import { issueBypass } from './../../lib/issueBypass';

export class PaymentWebhookRoute extends OpenAPIRoute {
  static schema = {
    tags: ['payment'],
    summary: 'Stripe Checkout webhook listener',
    description: 'Receives Stripe webhook events, issues a bypass token on `checkout.session.completed`, and stores a receipt in KV.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            description: 'Stripe webhook event object',
            properties: {
              id: { type: 'string', example: 'evt_12345' },
              type: { type: 'string', example: 'checkout.session.completed' },
              data: {
                type: 'object',
                properties: {
                  object: { type: 'object', additionalProperties: true }
                }
              }
            },
            required: ['type', 'data']
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Webhook processed successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ok: { type: 'boolean', example: true },
                token: { type: 'string', description: 'JWT bypass token (present only on checkout.session.completed)' }
              }
            }
          }
        }
      }
    }
  }

  async handle(c: any) {
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
  }
}
