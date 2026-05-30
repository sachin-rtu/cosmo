import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../plugins/authMiddleware'
import { supabaseAdmin } from '../plugins/supabase'

export async function playlistsRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', requireAuth)

    // GET /playlists — Fetch all playlists for the user
    fastify.get('/', async (request, reply) => {
        const { data, error } = await supabaseAdmin
            .from('playlists')
            .select('*')
            .eq('user_id', request.userId)
            .order('created_at', { ascending: false })

        if (error) {
            fastify.log.error({ error }, 'playlists: fetch failed')
            return reply.status(500).send({ error: 'Failed to fetch playlists' })
        }

        return reply.send(data ?? [])
    })

    // POST /playlists — Create a new playlist
    fastify.post('/', async (request, reply) => {
        const { name } = request.body as { name?: string }
        
        if (!name || name.trim() === '') {
            return reply.status(400).send({ error: 'Playlist name is required' })
        }

        const { data, error } = await supabaseAdmin
            .from('playlists')
            .insert({ user_id: request.userId, name: name.trim() })
            .select()
            .single()

        if (error) {
            fastify.log.error({ error }, 'playlists: create failed')
            return reply.status(500).send({ error: 'Failed to create playlist' })
        }

        return reply.send(data)
    })

    // GET /playlists/:id/tracks — Fetch tracks for a specific playlist
    fastify.get('/:id/tracks', async (request, reply) => {
        const { id } = request.params as { id: string }

        // Verify ownership
        const { data: playlist } = await supabaseAdmin
            .from('playlists')
            .select('id')
            .eq('id', id)
            .eq('user_id', request.userId)
            .single()

        if (!playlist) {
            return reply.status(404).send({ error: 'Playlist not found or unauthorized' })
        }

        const { data, error } = await supabaseAdmin
            .from('playlist_tracks')
            .select('*')
            .eq('playlist_id', id)
            .order('added_at', { ascending: false })

        if (error) {
            fastify.log.error({ error }, 'playlists: fetch tracks failed')
            return reply.status(500).send({ error: 'Failed to fetch playlist tracks' })
        }

        return reply.send(data ?? [])
    })

    // POST /playlists/:id/tracks — Add a track to a playlist
    fastify.post('/:id/tracks', async (request, reply) => {
        const { id } = request.params as { id: string }
        const { videoId, title, artist, thumbnail, durationMs } = request.body as {
            videoId: string
            title: string
            artist: string
            thumbnail?: string
            durationMs?: number
        }

        if (!videoId || !title || !artist) {
            return reply.status(400).send({ error: 'videoId, title, and artist are required' })
        }

        // Verify ownership
        const { data: playlist } = await supabaseAdmin
            .from('playlists')
            .select('id')
            .eq('id', id)
            .eq('user_id', request.userId)
            .single()

        if (!playlist) {
            return reply.status(404).send({ error: 'Playlist not found or unauthorized' })
        }

        const { error } = await supabaseAdmin.from('playlist_tracks').upsert(
            {
                playlist_id: id,
                video_id: videoId,
                title,
                artist,
                thumbnail: thumbnail ?? '',
                duration_ms: durationMs ?? 0
            },
            { onConflict: 'playlist_id,video_id' }
        )

        if (error) {
            fastify.log.error({ error, videoId, playlistId: id }, 'playlists: add track failed')
            return reply.status(500).send({ error: 'Failed to add track to playlist' })
        }

        return reply.send({ status: 'added' })
    })

    // DELETE /playlists/:id/tracks/:videoId — Remove a track from a playlist
    fastify.delete('/:id/tracks/:videoId', async (request, reply) => {
        const { id, videoId } = request.params as { id: string, videoId: string }

        // Verify ownership
        const { data: playlist } = await supabaseAdmin
            .from('playlists')
            .select('id')
            .eq('id', id)
            .eq('user_id', request.userId)
            .single()

        if (!playlist) {
            return reply.status(404).send({ error: 'Playlist not found or unauthorized' })
        }

        const { error } = await supabaseAdmin
            .from('playlist_tracks')
            .delete()
            .eq('playlist_id', id)
            .eq('video_id', videoId)

        if (error) {
            fastify.log.error({ error, videoId, playlistId: id }, 'playlists: remove track failed')
            return reply.status(500).send({ error: 'Failed to remove track from playlist' })
        }

        return reply.send({ status: 'removed' })
    })
}
