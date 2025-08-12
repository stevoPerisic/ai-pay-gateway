import { OpenAPIRoute, Str } from 'chanfana'
import { sign } from 'hono/jwt'

export class RedeemRoute extends OpenAPIRoute {
  static schema = {
    tags: ['payment'],
    summary: 'Redeem a paid challenge for access',
    request: {
      body: {
        content: {
          'application/json': {
            schema: { type: 'object', required: ['challenge_id'], properties: { challenge_id: Str() } }
          }
        }
      }
    },
    responses: { 200: { description: 'OK' } }
  }

  async handle(c: any) {
    // POC: skip payment verification; issue short token (wallet checks arrive in Epic 2)
    const now = Math.floor(Date.now() / 1000)
    const jwt = await sign({ sub: 'temp', iat: now, exp: now + 300 }, c.env.PAY_GATEWAY_SECRET)
    return new Response(JSON.stringify({
      set_cookie: `cfpay_jwt=${jwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
      cookie_name: 'cfpay_jwt',
      expires_at: new Date((now + 300) * 1000).toISOString()
    }), { headers: { 'content-type': 'application/json' } })
  }
}
