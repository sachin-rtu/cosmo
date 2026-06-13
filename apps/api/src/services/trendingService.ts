import { logger } from '../utils/logger'
import { Innertube, Platform, YTNodes } from 'youtubei.js'

// Re-use the same eval shim as streamServices
Platform.shim.eval = async (data: any) => {
    return new Function(data.output)()
}

export interface TrendingTrack {
    videoId: string
    title: string
    artist: string
    thumbnail: string | null
    durationMs: number
}

// Dedicated InnerTube instance scoped to India
let innertubeINPromise: Promise<Innertube> | null = null

async function getInnertubeIN(): Promise<Innertube> {
    if (!innertubeINPromise) {
        innertubeINPromise = Innertube.create({
            retrieve_player: false, // we don't need stream deciphering here
            location: 'IN',
            lang: 'en',
        }).catch(err => {
            innertubeINPromise = null
            throw err
        })
    }
    return innertubeINPromise
}

/**
 * Fetch top 15 trending music tracks for India via YTMusic Explore.
 *
 * Strategy:
 * 1. Call yt.music.getExplore() → returns MusicCarouselShelf sections
 * 2. Find the first carousel whose items are songs/videos
 * 3. Extract track metadata from MusicTwoRowItem or MusicResponsiveListItem
 * 4. Fallback: search "trending songs India" if Explore doesn't yield results
 */
export async function getTrendingTracks(): Promise<TrendingTrack[]> {
    const yt = await getInnertubeIN()

    try {
        const explore = await yt.music.getExplore()

        for (const section of explore.sections) {
            const tracks = extractTracksFromShelf(section.contents)
            if (tracks.length >= 5) {
                return tracks.slice(0, 15)
            }
        }
    } catch (err) {
        logger.error('getExplore failed, falling back to search:', err)
    }

    // Fallback: search-based trending
    return await searchFallback(yt)
}

function extractTracksFromShelf(contents: any[]): TrendingTrack[] {
    const tracks: TrendingTrack[] = []

    for (const item of contents) {
        if (item instanceof YTNodes.MusicTwoRowItem) {
            const videoId = item.endpoint?.payload?.videoId || (item.id?.length === 11 ? item.id : null)
            if (!videoId || videoId.length !== 11) continue

            let thumbUrl = item.thumbnail?.[0]?.url;
            if (thumbUrl && thumbUrl.startsWith('//')) thumbUrl = 'https:' + thumbUrl;
            
            tracks.push({
                videoId,
                title: item.title?.text ?? 'Unknown',
                artist: item.subtitle?.text ?? item.artists?.[0]?.name ?? 'Unknown',
                thumbnail: thumbUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                durationMs: 0,
            })
        } else if (item instanceof YTNodes.MusicResponsiveListItem) {
            if (item.item_type !== 'song' && item.item_type !== 'video') continue
            const videoId = item.endpoint?.payload?.videoId || (item.id?.length === 11 ? item.id : null)
            if (!videoId || videoId.length !== 11) continue

            let thumbUrl = item.thumbnails?.[0]?.url;
            if (thumbUrl && thumbUrl.startsWith('//')) thumbUrl = 'https:' + thumbUrl;

            tracks.push({
                videoId,
                title: item.title ?? item.name ?? 'Unknown',
                artist: item.artists?.[0]?.name ?? item.authors?.[0]?.name ?? 'Unknown',
                thumbnail: thumbUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                durationMs: (item.duration?.seconds ?? 0) * 1000,
            })
        }
    }

    return tracks
}

async function searchFallback(yt: Innertube): Promise<TrendingTrack[]> {
    const results = await yt.music.search('trending songs India', { type: 'song' })

    const tracks: TrendingTrack[] = []

    // results.contents is an array of MusicShelfRenderer sections
    // Each section has a .contents array of YTNodes.MusicResponsiveListItem
    if (results.contents) {
        for (const section of results.contents) {
            if (!('contents' in section)) continue
            for (const item of (section as any).contents) {
                if (item instanceof YTNodes.MusicResponsiveListItem) {
                    const videoId = item.endpoint?.payload?.videoId || (item.id?.length === 11 ? item.id : null)
                    if (!videoId || videoId.length !== 11) continue

                    let thumbUrl = item.thumbnails?.[0]?.url;
                    if (thumbUrl && thumbUrl.startsWith('//')) thumbUrl = 'https:' + thumbUrl;

                    tracks.push({
                        videoId,
                        title: item.title ?? item.name ?? 'Unknown',
                        artist: item.artists?.[0]?.name ?? item.authors?.[0]?.name ?? 'Unknown',
                        thumbnail: thumbUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        durationMs: (item.duration?.seconds ?? 0) * 1000,
                    })

                    if (tracks.length >= 15) return tracks
                }
            }
        }
    }

    return tracks.slice(0, 15)
}
