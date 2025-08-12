import { OpenAPIRoute } from 'chanfana'

export class StatusRoute extends OpenAPIRoute {
  static schema = {
    tags: ['payment'],
    summary: 'Challenge status',
    request: {
      query: {
        challenge_id: { type: 'string' }
      }
    },
    responses: { 200: { description: 'OK' } }
  }
  async handle() {
    return new Response(JSON.stringify({ status: 'pending' }), {
      headers: { 'content-type': 'application/json' }
    })
  }
}
