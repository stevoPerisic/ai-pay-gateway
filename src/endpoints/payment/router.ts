import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CheckoutRoute } from './checkout';
import { RedeemRoute } from './redeem';
import { StatusRoute } from './status';

export const paymentRouter = fromHono(new Hono());

paymentRouter.post("/", CheckoutRoute);
paymentRouter.post("/", RedeemRoute);
paymentRouter.get("/", StatusRoute);
