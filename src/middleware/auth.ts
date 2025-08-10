import type { FastifyRequest, FastifyReply } from "fastify";

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return reply.unauthorized();
  try {
    const payload = req.server.verifyAccess<{ sub: string }>(h.slice(7));
    req.user = { sub: payload.sub };
  } catch {
    return reply.unauthorized();
  }
}
