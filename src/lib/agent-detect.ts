export function isAgentRequest(req: Request): boolean {
  const accept = req.headers.get('accept') || ''
  const ua = req.headers.get('user-agent') || ''
  const caps = req.headers.get('agent-capabilities') || ''
  // Send JSON if a crawler/agent signals itself or asks for machine responses
  return accept.includes('application/json') || caps.includes('paywall-v1') || /Agent\//i.test(ua)
}
