import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../plugins/authMiddleware'
import { supabaseAdmin } from '../plugins/supabase'

export async function likesRoutes(fastify: FastifyInstance) {

    // All routes in this plugin require auth
    fastify.addHook('preHandler', requireAuth)

    // POST /likes/:videoId — Like a track
    fastify.post('/:videoId', async (request, reply) => {
        const { videoId } = request.params as { videoId: string }
        const { title, artist, artwork } = request.body as {
            title: string
            artist: string
            artwork?: string
        }

        if (!title || !artist) {
            return reply.status(400).send({ error: '"title" and "artist" are required' })
        }

        const { error } = await supabaseAdmin.from('user_likes').upsert(
            {
                user_id: request.userId,
                video_id: videoId,
                title,
                artist,
                artwork: artwork ?? '',
            },
            { onConflict: 'user_id,video_id' }
        )

        if (error) {
            fastify.log.error({ error, videoId }, 'likes: upsert failed')
            return reply.status(500).send({ error: 'Failed to like track' })
        }

        return reply.send({ status: 'liked', videoId })
    })

    // DELETE /likes/:videoId — Unlike a track
    fastify.delete('/:videoId', async (request, reply) => {
        const { videoId } = request.params as { videoId: string }

        const { error } = await supabaseAdmin
            .from('user_likes')
            .delete()
            .eq('user_id', request.userId)
            .eq('video_id', videoId)

        if (error) {
            fastify.log.error({ error, videoId }, 'likes: delete failed')
            return reply.status(500).send({ error: 'Failed to unlike track' })
        }

        return reply.send({ status: 'unliked', videoId })
    })

    // GET /likes — Fetch all liked songs for the authenticated user
    fastify.get('/', async (request, reply) => {
        const { limit = '50', offset = '0' } = request.query as {
            limit?: string
            offset?: string
        }

        const { data, error } = await supabaseAdmin
            .from('user_likes')
            .select('video_id, title, artist, artwork, created_at')
            .eq('user_id', request.userId)
            .order('created_at', { ascending: false })
            .range(Number(offset), Number(offset) + Number(limit) - 1)

        if (error) {
            fastify.log.error({ error }, 'likes: fetch failed')
            return reply.status(500).send({ error: 'Failed to fetch likes' })
        }

        return reply.send(data ?? [])
    })
}
