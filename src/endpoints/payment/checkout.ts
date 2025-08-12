import { OpenAPIRoute, Str } from 'chanfana'

export class CheckoutRoute extends OpenAPIRoute {
  static schema = {
    tags: ['payment'],
    summary: 'Create checkout (human path)',
    request: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['challenge_id', 'option_id'],
              properties: {
                challenge_id: Str({ example: 'abc123' }),
                option_id: Str({ example: 'one_time_50c' }),
                intent: Str({ required: false })
              }
            }
          }
        }
      }
    },
    responses: { 200: { description: 'OK' } }
  }
  async handle(c: any) {
    // For POC we return a URL where your HTML blockpage can POST to Stripe checkout
    const successUrl = new URL('/__cfpay/success', c.req.url).toString()
    // If you want to actually create a Stripe session here, move the logic from your blockpage.
    return new Response(JSON.stringify({ payment_url: '/__cfpay' , success_url: successUrl }), {
      headers: { 'content-type': 'application/json' }
    })
  }
}
