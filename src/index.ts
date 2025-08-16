import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { tasksRouter } from "./endpoints/tasks/router";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { DummyEndpoint } from "./endpoints/dummyEndpoint";
import { paymentRouter } from "./endpoints/payment/router";
import { WellKnownDescriptor } from "./endpoints/descriptor/well-known";
import { agentChallenge } from './routes/agent-challenge'
import { __cfpayRouter } from "./endpoints/__cfpay/router";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  if (err instanceof ApiException) {
    // If it's a Chanfana ApiException, let Chanfana handle the response
    return c.json(
      { success: false, errors: err.buildResponse() },
      err.status as ContentfulStatusCode,
    );
  }

  console.error("Global error handler caught:", err); // Log the error if it's not known

  // For other errors, return a generic 500 response
  return c.json(
    {
      success: false,
      errors: [{ code: 7000, message: "Internal Server Error" }],
    },
    500,
  );
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/docs",
  schema: {
    info: {
      title: "My Awesome API",
      version: "2.0.0",
      description: "This is the documentation for my awesome API.",
    },
  },
});

const isAgent = (req: Request) => {
  const accept = req.headers.get('accept') || ''
  const caps = req.headers.get('agent-capabilities') || ''
  const ua = req.headers.get('user-agent') || ''
  return accept.includes('application/json') || caps.includes('paywall-v1') || /Agent\//i.test(ua)
}

// root
openapi.get("/", async (c) => {
  return c.json({ ok: true });
  const url = new URL(c.req.url)
  const jwtCookie = c.req.header('Cookie')?.match(/cfpay_jwt=([^;]+)/)?.[1]
  let valid = false
  if (jwtCookie) {
    try {
      await verify(jwtCookie, c.env.PAY_GATEWAY_SECRET)
      valid = true
    } catch { valid = false }
  }
  
  const suspicious = url.pathname.startsWith('/reports/')
    || ((c.req.header('cf-bot-score') && Number(c.req.header('cf-bot-score')) < 30) ?? false)
    || (c.req.header('user-agent') || '').includes('curl')

  const isSystemPath = url.pathname.startsWith('/__cfpay')
    || url.pathname.startsWith('/.well-known')
    || url.pathname === '/openapi.json'
    || url.pathname === '/docs'
    || url.pathname.startsWith('/__challenge')

  if (!valid && suspicious && !isSystemPath) {
    if (isAgent(c.req.raw)) return c.redirect('/__challenge', 302)
    return c.redirect('/__cfpay?why=Suspicious%20or%20premium%20access%20required.', 302)
  }
  await next()
});

// Register Tasks Sub router
openapi.route("/tasks", tasksRouter);

// Register Payment Sub router
openapi.route("/payment", paymentRouter);

// Register __cfpay Sub router
openapi.route("/__cfpay", __cfpayRouter); 

// Register other endpoints
openapi.post("/dummy/:slug", DummyEndpoint);
openapi.all('/__challenge', (c) => agentChallenge(c))
openapi.get("/.well-known/agent-paywall", WellKnownDescriptor);


// Export the Hono app
export default app;
