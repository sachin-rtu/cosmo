import type { FastifyRequest, FastifyReply } from 'fastify'
import { supabaseAdmin } from './supabase'

// Extend FastifyRequest to include userId
declare module 'fastify' {
    interface FastifyRequest {
        userId: string
    }
}

/**
 * Fastify preHandler hook that verifies the Supabase JWT
 * and attaches `request.userId` for downstream route handlers.
 */
export async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing or invalid Authorization header' })
    }

    const token = authHeader.slice(7) // strip "Bearer "

    const { data, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !data.user) {
        return reply.status(401).send({ error: 'Invalid or expired token' })
    }

    request.userId = data.user.id
}
