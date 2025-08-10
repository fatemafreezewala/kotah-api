import "fastify";
import { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    user?: { sub: string };
  }
  interface FastifyInstance {
    prisma: PrismaClient;
    signAccess(payload: object): string;
    signRefresh(payload: object): { token: string; jti: string; exp: Date };
    verifyAccess<T = any>(token: string): T;
  }
}
