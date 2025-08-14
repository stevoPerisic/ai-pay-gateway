import { Hono } from "hono";
import { fromHono } from "chanfana";
import { PaywallPageRoute } from './paywall';
import { CheckoutPageRoute } from './checkout';
import { PaymentWebhookRoute } from './payment-webhook';
import { PaywallSuccessRoute } from './success';

export const __cfpayRouter = fromHono(new Hono());

paymentRouter.get("/paywall", PaywallPageRoute); 
paymentRouter.get("/checkout", CheckoutPageRoute); 
paymentRouter.get("/payment-webhook", PaymentWebhookRoute);
paymentRouter.get("/success", PaywallSuccessRoute)
