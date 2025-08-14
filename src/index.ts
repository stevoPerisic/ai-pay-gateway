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
openapi.get("/", async handle(c: any) { return c.json({ ok: 'Root :)' }) });

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
