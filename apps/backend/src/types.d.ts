import "@fastify/jwt";

declare module "fastify" {
  interface FastifyInstance { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }
}

declare module "@fastify/jwt" {
  interface FastifyJWT { payload: { sub: string; username: string; roles: string[] }; user: { sub: string; username: string; roles: string[] } }
}
