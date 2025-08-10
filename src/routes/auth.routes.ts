import type { FastifyInstance } from "fastify";
import * as ctrl from "../controllers/auth.controller.js";

export default async function routes(app: FastifyInstance) {
  app.post("/otp/send", ctrl.sendOtp);
  app.post("/otp/verify", ctrl.verifyOtp);
  app.post("/refresh", ctrl.refresh);
  app.post("/logout", ctrl.logout);
}
