import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CheckoutRoute } from './checkout';
import { RedeemRoute } from './redeem';
import { StatusRoute } from './status';

export const paymentRouter = fromHono(new Hono());

paymentRouter.post("/checkout", CheckoutRoute);
paymentRouter.post("/redeem", RedeemRoute);
paymentRouter.get("/status", StatusRoute);
