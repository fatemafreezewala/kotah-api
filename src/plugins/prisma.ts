import fp from "fastify-plugin";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

// type import (only types, no runtime code)
import type { PrismaClient as PrismaClientType } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClientType;
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
