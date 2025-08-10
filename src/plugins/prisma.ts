import fp from "fastify-plugin";
import { PrismaClient } from "../../generated/prisma/index.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
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
