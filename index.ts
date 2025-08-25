import "dotenv/config"; // loads .env automatically
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

import prismaPlugin from "./src/plugins/prisma.js";
import jwtPlugin from "./src/plugins/jwt.js";
import authRoutes from "./src/routes/auth.routes.js";
// import familyRoutes from "./src/routes/family.routes.js";

// Create Fastify instance with Ajv config allowing "example" keyword
const app = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      strict: false, // relax strict mode to allow custom keywords
      keywords: ["example"], // explicitly allow `example` in schemas
    },
  },
});

// Basics
await app.register(sensible);
await app.register(helmet);
await app.register(cors, { origin: true, credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

// Swagger (OpenAPI)
await app.register(swagger, {
  openapi: {
    info: {
      title: "Kotah API",
      description: "Auth, Families, Members, Locations",
      version: "1.0.0",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local dev" },
      { url: "http://68.183.55.216:3000", description: "Production" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    tags: [
      { name: "User", description: "User authentication & profile" },
    ],
  },
});
await app.register(swaggerUI, {
  routePrefix: "/docs",
  uiConfig: { docExpansion: "list", deepLinking: true },
});

// Plugins
await app.register(prismaPlugin);
await app.register(jwtPlugin);

// Health + OpenAPI JSON
app.get("/health", async () => ({ status: "okkkkkkk" }));
app.get("/openapi.json", async () => app.swagger());

// Routes
await app.register(authRoutes, { prefix: "/api/user" });
// await app.register(familyRoutes, { prefix: "/api/family" });

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" });
