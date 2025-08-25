import type { FastifyInstance } from "fastify";
import * as ctrl from "../controllers/auth.controller.js";

export default async function routes(app: FastifyInstance) {
  // Login
  app.post("/login", {
    schema: {
      tags: ["User"],
      summary: "Login with email and password",
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "user@example.com",
          },
          password: {
            type: "string",
            minLength: 6,
            example: "secret123",
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            access: { type: "string", example: "eyJhbGciOi..." },
            refresh: { type: "string", example: "eyJhbGciOi..." },
            user: {
              type: "object",
              properties: {
                id: { type: "string", example: "64eb44cb5592fdc93e7ec8ef" },
                email: { type: "string", format: "email", example: "user@example.com" },
                phone: { type: "string", example: "+971501234567", nullable: true },
                name: { type: "string", example: "Mohammed Alhashimi", nullable: true },
                gender: {
                  type: "string",
                  enum: ["male", "female", "other"],
                  example: "male",
                  nullable: true,
                },
                birthDate: { type: "string", format: "date", example: "1990-01-01", nullable: true },
                avatarUrl: {
                  type: "string",
                  format: "uri",
                  example: "https://example.com/avatar.jpg",
                  nullable: true,
                },
              },
            },
          },
        },
      },
    },
    handler: ctrl.login,
  });
  

  // Signup (email + password)
  app.post("/signup-password", {
    schema: {
      tags: ["User"],
      summary: "Signup using email, password, and optional phone number",
      body: {
        type: "object",
        required: ["password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "newuser@example.com",
            description: "User email (optional if using phone)",
          },
          password: {
            type: "string",
            minLength: 6,
            example: "password123",
            description: "Account password",
          },
          name: {
            type: "string",
            example: "John Doe",
            description: "Full name",
          },
          countryCode: {
            type: "string",
            example: "+971",
            description: "Country code for the phone number (e.g. +971, +1)",
          },
          phoneNumber: {
            type: "string",
            example: "500000000",
            description: "Phone number without country code",
          },
        },
      },
      response: {
        201: {
          description: "User created successfully",
          type: "object",
          properties: {
            ok: { type: "boolean", example: true },
            userId: { type: "string", example: "65f7f84709f9a242b379a921" },
          },
        },
        400: {
          description: "Invalid input or user already exists",
          type: "object",
          properties: {
            statusCode: { type: "number", example: 400 },
            error: { type: "string", example: "Bad Request" },
            message: { type: "string", example: "User already exists" },
          },
        },
      },
    },
    handler: ctrl.signup,
  });
  // Send OTP
  app.post("/otp/send", {
    schema: {
      tags: ["User"],
      summary: "Send OTP to email or phone",
      body: {
        type: "object",
        required: ["target"],
        properties: {
          target: { type: "string", example: "user@example.com" },
          purpose: { type: "string", enum: ["signup", "login"], example: "signup" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            ttlMinutes: { type: "number" },
          },
        },
      },
    },
    handler: ctrl.sendOtp,
  });

  // Verify OTP
  app.post("/otp/verify", {
    schema: {
      tags: ["User"],
      summary: "Verify OTP and login/register",
      body: {
        type: "object",
        required: ["target", "code"],
        properties: {
          target: { type: "string", example: "user@example.com" },
          code: { type: "string", example: "123456" },
          profile: {
            type: "object",
            properties: {
              name: { type: "string", example: "Aisha" },
            },
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            access: { type: "string" },
            refresh: { type: "string" },
            user: { type: "object" },
          },
        },
      },
    },
    handler: ctrl.verifyOtp,
  });

  // Refresh Token
  app.post("/refresh", {
    schema: {
      tags: ["User"],
      summary: "Refresh access token",
      body: {
        type: "object",
        required: ["refresh"],
        properties: {
          refresh: { type: "string", example: "your-refresh-token" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            access: { type: "string" },
          },
        },
      },
    },
    handler: ctrl.refresh,
  });

  // Logout
  app.post("/logout", {
    schema: {
      tags: ["User"],
      summary: "Logout and revoke refresh token",
      body: {
        type: "object",
        required: ["refresh"],
        properties: {
          refresh: { type: "string", example: "your-refresh-token" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
          },
        },
      },
    },
    handler: ctrl.logout,
  });

  // Complete profile
  app.post("/profile/complete", {
    schema: {
      tags: ["User"],
      summary: "Complete user profile and create family",
      body: {
        
        type: "object",
        required: ["name", "familyName", "roleInFamily"],
        properties: {
          name: { type: "string", example: "Aisha" },
          gender: { type: "string", enum: ["male", "female", "other"], example: "female" },
          birthDate: { type: "string", format: "date", example: "1990-01-01" },
          avatarUrl: { type: "string", format: "url", example: "https://example.com/avatar.jpg" },
          familyName: { type: "string", example: "My Family" },
          roleInFamily: {
            type: "string",
            enum: ["OWNER", "SPOUSE", "SON", "DAUGHTER", "GUARDIAN", "OTHER"],
            example: "OWNER",
          },
          locations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", example: "Home" },
                address: { type: "string", example: "123 Main St" },
                lat: { type: "number", example: 25.276987 },
                lng: { type: "number", example: 55.296249 },
              },
            },
          },
        },
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
    handler: ctrl.completeProfile,
  });
}
