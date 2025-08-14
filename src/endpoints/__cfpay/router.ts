import { Hono } from "hono";
import { fromHono } from "chanfana";
import { PaywallPageRoute } from './paywall';
import { CheckoutPageRoute } from './checkout';
import { PaymentWebhookRoute } from './payment-webhook';
import { PaywallSuccessRoute } from './success';

export const __cfpayRouter = fromHono(new Hono());

__cfpayRouter.get("/paywall", PaywallPageRoute); 
__cfpayRouter.get("/checkout", CheckoutPageRoute); 
__cfpayRouter.get("/payment-webhook", PaymentWebhookRoute);
__cfpayRouter.get("/success", PaywallSuccessRoute)
