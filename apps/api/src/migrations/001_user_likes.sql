-- Cosmo: Liked Songs table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    artwork TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, video_id)
);

CREATE INDEX idx_user_likes_user ON user_likes(user_id);

ALTER TABLE user_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own likes"
    ON user_likes FOR ALL
    USING (auth.uid() = user_id);
