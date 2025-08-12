import { OpenAPIRoute } from 'chanfana'

export class WellKnownDescriptor extends OpenAPIRoute {
  static schema = {
    tags: ['descriptor'],
    summary: 'Agent descriptor',
    responses: {
      200: {
        description: 'Descriptor',
        content: { 'application/json': { schema: { type: 'object' } } }
      }
    }
  }
  async handle(c: any) {
    return new Response(JSON.stringify({
      version: '1',
      service: 'cf-ai-pay-gateway',
      service_desc: '/openapi.json',
      token_format: 'jwt_cookie',
      cookie_name: 'cfpay_jwt',
      support: `mailto:admin@${c.env.ORIGIN_HOST}`
    }), { headers: { 'content-type': 'application/json' } })
  }
}
