import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

const SendOtpSchema = z.object({
  target: z.string().min(3), // phone or email
  purpose: z.enum(["signup", "login", "invite"]).default("signup"),
});

export async function sendOtp(req: FastifyRequest, reply: FastifyReply) {
  const { target, purpose } = SendOtpSchema.parse(req.body);
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const ttl = Number(process.env.OTP_TTL_MINUTES ?? 10);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

  await req.server.prisma.otp.create({
    data: { target, code, purpose, expiresAt },
  });

  // TODO: integrate SMS/Email provider here
  req.server.log.info({ target, purpose, code }, "OTP generated");

  return reply.send({ ok: true, ttlMinutes: ttl });
}

const VerifySchema = z.object({
  target: z.string(),
  code: z.string().length(6),
  profile: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
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

  // Find or create user
  let user = await req.server.prisma.user.findFirst({
    where: { OR: [{ phone: target }, { email: target }] },
  });
  if (!user) {
    user = await req.server.prisma.user.create({
      data: target.includes("@")
        ? { email: target, name: profile?.name }
        : { phone: target, name: profile?.name },
    });
    // Optionally: create default family for first-time users later after profile step
  }

  const access = req.server.signAccess({ sub: user.id });
  const { token: refresh, jti, exp } = req.server.signRefresh({ sub: user.id });

  await req.server.prisma.session.create({
    data: { userId: user.id, refreshJti: jti, expiresAt: exp },
  });

  return reply.send({ access, refresh, user });
}

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
  if (!session || session.expiresAt < new Date())
    return reply.unauthorized("Invalid session");

  const access = req.server.signAccess({ sub: payload.sub });
  return reply.send({ access });
}

export async function logout(req: FastifyRequest, reply: FastifyReply) {
  const { refresh } = (req.body as any) ?? {};
  if (!refresh) return reply.badRequest("Missing refresh token");
  const payload = (await import("jsonwebtoken")).verify(
    refresh,
    process.env.JWT_REFRESH_SECRET!
  ) as any;
  await req.server.prisma.session
    .delete({ where: { refreshJti: payload.jti } })
    .catch(() => {});
  return reply.send({ ok: true });
}
