// Generate JWT “bypass” token
export async function issueBypass(env: Env, subject: string, ttlSec = 3600) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { sub: subject, iat: now, exp: now + ttlSec }
  return await sign(payload, env.PAY_GATEWAY_SECRET)
}
