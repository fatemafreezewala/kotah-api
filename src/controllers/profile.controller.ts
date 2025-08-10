import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/index.js";

// shared validator helpers
const ISODate = z.coerce.date(); // accepts string/number -> Date

// ----- GET /profile
export async function getProfile(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req.user as any)?.sub as string;
  const user = await req.server.prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { family: { include: { locations: true } } },
        orderBy: { createdAt: "asc" },
      },
      ownedFamilies: true,
    },
  });

  if (!user) return reply.notFound("User not found");

  return reply.send({ user });
}

// ----- PATCH /profile
const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthDate: z.coerce
    .date()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  avatarUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  phone: z
    .string()
    .min(3)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  email: z
    .string()
    .email()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
export async function updateProfile(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req.user as any)?.sub as string;
  const body = UpdateProfileSchema.parse(req.body);

  // Remove undefined values and convert nullable ones to null
  const data: Prisma.UserUpdateInput = {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.email !== undefined && { email: body.email ?? null }),
    ...(body.phone !== undefined && { phone: body.phone ?? null }),
    ...(body.gender !== undefined && { gender: body.gender ?? null }),
    ...(body.birthDate !== undefined && { birthDate: body.birthDate ?? null }),
    ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl ?? null }),
  };

  try {
    const user = await req.server.prisma.user.update({
      where: { id: userId },
      data,
    });
    return reply.send({ user });
  } catch (err: any) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return reply.badRequest("Email or phone already in use");
    }
    req.server.log.error({ err }, "updateProfile failed");
    return reply.internalServerError("Unable to update profile");
  }
}

// ----- POST /profile/complete  (finish registration)
const LocationSchema = z.object({
  label: z.string().min(1),
  address: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  lat: z
    .number()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  lng: z
    .number()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

const CompleteProfileSchema = z.object({
  // profile
  name: z.string().min(1).max(120),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthDate: ISODate.optional(),
  avatarUrl: z.string().url().optional(),

  // family
  familyName: z.string().min(1).default("My Family"),
  roleInFamily: z
    .enum(["OWNER", "SPOUSE", "SON", "DAUGHTER", "GUARDIAN", "OTHER"])
    .default("OWNER"),

  // optional initial locations
  locations: z.array(LocationSchema).optional(),
});

export async function completeProfile(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (req.user as any)?.sub as string;
  const {
    name,
    gender,
    birthDate,
    avatarUrl,
    familyName,
    roleInFamily,
    locations,
  } = CompleteProfileSchema.parse(req.body);

  try {
    const result = await req.server.prisma.$transaction(async (tx) => {
      // 1) update user profile (omit undefined, nullify empty)
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name,
          ...(gender !== undefined && { gender: gender ?? null }),
          ...(birthDate !== undefined && { birthDate: birthDate ?? null }),
          ...(avatarUrl !== undefined && { avatarUrl: avatarUrl ?? null }),
        },
      });

      // 2) create family
      const family = await tx.family.create({
        data: {
          name: familyName,
          ownerId: userId,
        },
      });

      // 3) create membership
      await tx.familyMember.create({
        data: {
          userId,
          familyId: family.id,
          role: roleInFamily as any,
        },
      });

      // 4) optional locations (convert undefined → null)
      if (locations?.length) {
        await tx.location.createMany({
          data: locations.map((l) => ({
            familyId: family.id,
            label: l.label,
            address: l.address ?? null,
            lat: l.lat ?? null,
            lng: l.lng ?? null,
          })),
        });
      }

      return { user, family };
    });

    return reply.code(201).send({ ok: true, ...result });
  } catch (err) {
    req.server.log.error({ err }, "completeProfile failed");
    return reply.internalServerError("Unable to complete registration");
  }
}
