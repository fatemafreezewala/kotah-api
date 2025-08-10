import type { FastifyInstance } from "fastify";
import {
  updateProfile,
  completeProfile,
  getProfile,
} from "../controllers/profile.controller.js";

export default async function profileRoutes(app: FastifyInstance) {
  //app.addHook("preHandler", app.verifyAccess);

  app.get(
    "/profile",
    {
      schema: {
        tags: ["Profile"],
        summary: "Get user profile",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              user: { type: "object" }, // you can expand with all user fields
            },
          },
        },
      },
    },
    getProfile
  );

  app.patch(
    "/profile",
    {
      schema: {
        tags: ["Profile"],
        summary: "Update user profile",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            name: { type: "string", example: "John Doe" },
            email: {
              type: "string",
              format: "email",
              example: "john@example.com",
            },
            phone: { type: "string", example: "+9647700000000" },
            gender: { type: "string", enum: ["male", "female", "other"] },
            birthDate: {
              type: "string",
              format: "date",
              example: "1990-05-20",
            },
            avatarUrl: {
              type: "string",
              format: "uri",
              example: "https://example.com/avatar.png",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user: { type: "object" },
            },
          },
        },
      },
    },
    updateProfile
  );

  app.post(
    "/profile/complete",
    {
      schema: {
        tags: ["Profile"],
        summary: "Complete profile and create family",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            gender: { type: "string", enum: ["male", "female", "other"] },
            birthDate: { type: "string", format: "date" },
            avatarUrl: { type: "string", format: "uri" },
            familyName: { type: "string" },
            roleInFamily: {
              type: "string",
              enum: ["OWNER", "SPOUSE", "SON", "DAUGHTER", "GUARDIAN", "OTHER"],
            },
            locations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  address: { type: "string" },
                  lat: { type: "number" },
                  lng: { type: "number" },
                },
              },
            },
          },
          required: ["name", "familyName", "roleInFamily"],
        },
        response: {
          201: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              user: { type: "object" },
              family: { type: "object" },
            },
          },
        },
      },
    },
    completeProfile
  );
}
