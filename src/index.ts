import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { tasksRouter } from "./endpoints/tasks/router";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { DummyEndpoint } from "./endpoints/dummyEndpoint";
import { paymentRouter } from "./endpoints/payment/router";
import { WellKnownDescriptor } from "./endpoints/descriptor/well-known";
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

// root
openapi.get("/", async (c) => {
  const url = new URL(c.req.url)
  const jwtCookie = c.req.header('Cookie')?.match(/cfpay_jwt=([^;]+)/)?.[1]
  let valid = false
  if (jwtCookie) {
    try {
      await verify(jwtCookie, c.env.PAY_GATEWAY_SECRET)
      valid = true
    } catch { valid = false }
  }

  // Decide who gets the paywall (replace with your own WAF signal or heuristics)
  const looksSuspicious =
    c.req.header('cf-ipcountry') === 'T1' || // Tor
    (c.req.header('user-agent') || '').includes('curl') ||
    c.req.header('cf-visitor')?.includes('bot') // just illustrative

  if (!valid && looksSuspicious && !url.pathname.startsWith('/__cfpay')) {
    const p = new URL('/__cfpay', url)
    p.searchParams.set('why', 'Suspicious or premium access required.')
    return c.redirect(p.toString(), 302)
  }

  // Proxy to origin
  const upstream = `https://${c.env.ORIGIN_HOST}${url.pathname}${url.search}`
  return fetch(upstream, {
    method: c.req.method,
    headers: Object.fromEntries([...c.req.raw.headers]),
    body: ['GET','HEAD'].includes(c.req.method) ? undefined : await c.req.arrayBuffer()
  })
});

// Register Tasks Sub router
openapi.route("/tasks", tasksRouter);

// Register Payment Sub router
openapi.route("/payment", paymentRouter);

// Register __cfpay Sub router
openapi.route("/__cfpay", __cfpayRouter); 

// Register other endpoints
openapi.post("/dummy/:slug", DummyEndpoint);
openapi.get("/.well-known/agent-paywall", WellKnownDescriptor);


// Export the Hono app
export default app;
