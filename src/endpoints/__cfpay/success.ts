// 4) Success endpoint → set cookie, redirect back
import { OpenAPIRoute, Str } from 'chanfana'
import { issueBypass } from './../../lib/issueBypass';

export class PaywallSuccessRoute extends OpenAPIRoute {
  static schema = {
    tags: ['ui'],
    summary: 'Payment success redirect',
    description: 'Handles the post-payment redirect. Issues a temporary JWT bypass token and redirects the user to the specified return path.',
    request: {
      query: {
        r: Str({ description: 'Return-to path after payment', example: '/' })
      }
    },
    responses: {
      302: {
        description: 'Redirect to the return path',
        headers: {
          'Set-Cookie': {
            schema: { type: 'string' },
            description: 'JWT bypass cookie'
          },
          'Location': {
            schema: { type: 'string' },
            description: 'Redirect destination'
          }
        }
      }
    }
  }

  async handle(c: any) {
    const url = new URL(c.req.url)
    const returnPath = url.searchParams.get('r') || '/'

    // In production: confirm payment via Stripe API
    const token = await issueBypass(c.env, 'temp', 300) // 5 minutes grace

    c.header(
      'Set-Cookie',
      `cfpay_jwt=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`
    )

    return c.redirect(returnPath, 302)
  }
}
