import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    signAccess(payload: object): string;
    signRefresh(payload: object): { token: string; jti: string; exp: Date };
    verifyAccess<T = any>(token: string): T;
    verifyAccessHook: (request: FastifyRequest, reply: FastifyReply) => void;
  }
  interface FastifyRequest {
    user?: any;
  }
}

export default fp(async (app) => {
  const accessSecret = process.env.JWT_ACCESS_SECRET!;
  const refreshSecret = process.env.JWT_REFRESH_SECRET!;

  app.decorate("signAccess", (payload: object) =>
    jwt.sign(payload, accessSecret, { expiresIn: "15m" })
  );

  app.decorate("signRefresh", (payload: object) => {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ ...payload, jti }, refreshSecret, {
      expiresIn: "30d",
    });
    const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return { token, jti, exp };
  });

  // Simple token verifier
  app.decorate(
    "verifyAccess",
    (token: string) => jwt.verify(token, accessSecret) as any
  );

  // Middleware-style hook
  app.decorate(
    "verifyAccessHook",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.unauthorized("Missing or invalid Authorization header");
        }
        const token = authHeader.slice(7);
        const payload = app.verifyAccess(token);
        request.user = payload;
      } catch {
        return reply.unauthorized("Invalid or expired token");
      }
    }
  );
});
