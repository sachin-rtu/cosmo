declare module 'lrclib-api' {
    export class LrcLib {
        get(title: string, artist: string): Promise<{ syncedLyrics?: string; plainLyrics?: string }>;
        getSynced(title: string, artist: string): Promise<string | { time: number; text: string }[]>;
        getUnsynced(title: string, artist: string): Promise<string>;
    }
}
