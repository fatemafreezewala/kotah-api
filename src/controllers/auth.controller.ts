import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { randomUUID } from "crypto";

// ----- Shared validators -----
const ISODate = z.coerce.date();
const LocationSchema = z.object({
  label: z.string().min(1),
  address: z.string().nullable().optional().transform((v) => v ?? null),
  lat: z.number().nullable().optional().transform((v) => v ?? null),
  lng: z.number().nullable().optional().transform((v) => v ?? null),
});

// ----- POST /auth/register (OTP Sign-up Step 1) -----
const SendOtpSchema = z.object({
  target: z.string().min(3),
  purpose: z.enum(["signup", "login"]).default("signup"),
});

export async function sendOtp(req: FastifyRequest, reply: FastifyReply) {
  const { target, purpose } = SendOtpSchema.parse(req.body);
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const ttl = Number(process.env.OTP_TTL_MINUTES ?? 10);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

  await req.server.prisma.otp.create({
    data: { target, code, purpose, expiresAt },
  });

  req.server.log.info({ target, purpose, code }, "OTP generated");

  return reply.send({ ok: true, ttlMinutes: ttl });
}

// ----- POST /auth/verify-otp (OTP Sign-up Step 2) -----
const VerifySchema = z.object({
  target: z.string(),
  code: z.string().length(6),
  profile: z.object({ name: z.string().optional() }).optional(),
});

export async function verifyOtp(req: FastifyRequest, reply: FastifyReply) {
  const { target, code, profile } = VerifySchema.parse(req.body);

  const otp = await req.server.prisma.otp.findFirst({
    where: { target, code, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return reply.badRequest("Invalid or expired code");

  await req.server.prisma.otp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  let user = await req.server.prisma.user.findFirst({
    where: { OR: [{ email: target }, { phone: target }] },
  });

  if (!user) {
    user = await req.server.prisma.user.create({
      //@ts-ignore
      data: target.includes("@")
        ? { email: target, name: profile?.name }
        : { phone: target, name: profile?.name },
    });
  }

  const access = req.server.signAccess({ sub: user.id });
  const { token: refresh, jti, exp } = req.server.signRefresh({ sub: user.id });

  await req.server.prisma.session.create({
    data: { userId: user.id, refreshJti: jti, expiresAt: exp },
  });

  return reply.send({ access, refresh, user });
}

// ----- POST /auth/signup-password (email + password method) -----
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  countryCode: z.string().min(2).max(5), // e.g., "+971"
  phoneNumber: z.string().min(5).max(15), // local number
});

// --- Helper to Format Phone to E.164 ---
function formatPhone(countryCode: string, phoneNumber: string): string {
  const parsed = parsePhoneNumberFromString(`${countryCode}${phoneNumber}`);
  if (!parsed?.isValid()) throw new Error("Invalid phone number");
  return parsed.number; // E.164 format e.g., +971500000000
}

// --- Controller: Signup with phone ---
export async function signup(req: FastifyRequest, reply: FastifyReply) {
  const { email, password, name, countryCode, phoneNumber } = SignupSchema.parse(req.body);

  let formattedPhone: string;
  try {
    formattedPhone = formatPhone(countryCode, phoneNumber);
  } catch {
    return reply.badRequest("Invalid phone number");
  }

  // Check if email or phone already exists
  const exists = await req.server.prisma.user.findFirst({
    where: {
      OR: [
        { email: email ?? undefined },
        { phone: formattedPhone },
      ],
    },
  });

  if (exists) return reply.badRequest("User already exists");

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await req.server.prisma.user.create({
    //@ts-ignore
    data: {
      email,
      phone: formattedPhone,
      countryCode: countryCode, 
      name,
      passwordHash,
    },
  });

  return reply.code(201).send({ status: true, userId: user.id });
}

// ----- POST /auth/login (email + password) -----
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function login(req: FastifyRequest, reply: FastifyReply) {
  const { email, password } = LoginSchema.parse(req.body);

  const user = await req.server.prisma.user.findUnique({
    where: { email },
  });
  console.log(user)
  if (!user || !user.passwordHash) {
    return reply.unauthorized("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return reply.unauthorized("Invalid email or password");
  }

  const access = req.server.signAccess({ sub: user.id });
  const { token: refresh, jti, exp } = req.server.signRefresh({ sub: user.id });

  await req.server.prisma.session.create({
    data: { userId: user.id, refreshJti: jti, expiresAt: exp },
  });

  return reply.send({
    access,
    refresh,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      birthDate: user.birthDate,
      avatarUrl: user.avatarUrl,
    },
    test:"123"
  });
}

// ----- POST /auth/refresh -----
export async function refresh(req: FastifyRequest, reply: FastifyReply) {
  const { refresh } = (req.body as any) ?? {};
  if (!refresh) return reply.badRequest("Missing refresh token");

  const payload = (await import("jsonwebtoken")).verify(
    refresh,
    process.env.JWT_REFRESH_SECRET!
  ) as any;

  const session = await req.server.prisma.session.findUnique({
    where: { refreshJti: payload.jti },
  });

  if (!session || session.expiresAt < new Date()) {
    return reply.unauthorized("Invalid session");
  }

  const access = req.server.signAccess({ sub: payload.sub });
  return reply.send({ access });
}

// ----- POST /auth/logout -----
export async function logout(req: FastifyRequest, reply: FastifyReply) {
  const { refresh } = (req.body as any) ?? {};
  if (!refresh) return reply.badRequest("Missing refresh token");

  const payload = (await import("jsonwebtoken")).verify(
    refresh,
    process.env.JWT_REFRESH_SECRET!
  ) as any;

  await req.server.prisma.session.delete({ where: { refreshJti: payload.jti } }).catch(() => {});
  return reply.send({ ok: true });
}

// ----- POST /profile/complete -----
const CompleteProfileSchema = z.object({
  name: z.string().min(1).max(120),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthDate: ISODate.optional(),
  avatarUrl: z.string().url().optional(),
  familyName: z.string().min(1).default("My Family"),
  roleInFamily: z.enum(["OWNER", "SPOUSE", "SON", "DAUGHTER", "GUARDIAN", "OTHER"]).default("OWNER"),
  locations: z.array(LocationSchema).optional(),
});

export async function completeProfile(req: FastifyRequest, reply: FastifyReply) {
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
    const result = await req.server.prisma.$transaction(async (tx: any) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name,
          ...(gender && { gender }),
          ...(birthDate && { birthDate }),
          ...(avatarUrl && { avatarUrl }),
        },
      });

      const family = await tx.family.create({
        data: { name: familyName, ownerId: userId },
      });

      await tx.familyMember.create({
        data: { userId, familyId: family.id, role: roleInFamily },
      });

      if (locations?.length) {
        await tx.location.createMany({
          data: locations.map((l) => ({
            familyId: family.id,
            label: l.label,
            address: l.address,
            lat: l.lat,
            lng: l.lng,
          })),
        });
      }

      return { user, family };
    });

    return reply.code(201).send({ ok: true, ...result });
  } catch (err: any) {
    req.server.log.error({ err }, "completeProfile failed");
    return reply.internalServerError("Unable to complete registration");
  }
}
