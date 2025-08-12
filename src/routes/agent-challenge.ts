import type { Context } from 'hono'
export function agentChallenge(c: Context) {
  const challengeId = crypto.randomUUID()
  const payload = {
    type: env.ERROR_PAYMENT_REQUIRED_URL,
    title: 'Payment or verification required',
    detail: 'Choose a pass to continue.',
    challenge_id: challengeId,
    options: [
      { id: 'one_time_50c', kind: 'one_time', amount_cents: 50, ttl_seconds: 3600 },
      { id: 'day_pass_3',   kind: 'one_time', amount_cents: 300, ttl_seconds: 86400 }
    ],
    payment_methods: ['stripe_card'],
    post_payment_token: { format: 'jwt_cookie', cookie_name: 'cfpay_jwt' },
    return_to: '/',           // you can set the original URL here if you store it
    terms_url: '/terms'
  }

  return new Response(JSON.stringify(payload), {
    status: 402,
    headers: {
      'content-type': 'application/problem+json',
      // agent-readable hints & discovery
      'Agent-Challenge': `v1 challenge_id=${challengeId}; expires=${new Date(Date.now() + 5 * 60e3).toISOString()}`,
      'Link': '</.well-known/agent-paywall>; rel="paywall", </openapi.json>; rel="service-desc"'
    }
  })
}
