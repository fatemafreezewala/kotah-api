import fp from "fastify-plugin";
import { createRequire } from "node:module";

// 1) Get runtime PrismaClient via require
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../../generated/prisma");

// 2) Import type separately for TypeScript
import type { PrismaClient as PrismaClientType } from "../../generated/prisma/index.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClientType; // ✅ type comes from import type
  }
}

export default fp(async (app) => {
  const prisma = new PrismaClient({ log: ["warn", "error"] });
  await prisma.$connect();

  app.decorate("prisma", prisma);

  app.addHook("onClose", (instance, done) => {
    instance.prisma.$disconnect().finally(() => done());
  });
});
