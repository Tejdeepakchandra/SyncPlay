/**
 * PostgreSQL schema and migration SQL for analytics tables.
 *
 * Run this SQL in Supabase SQL Editor.
 * Notes:
 * - Uses TEXT ids so Mongo ObjectId and Clerk ids can be stored without UUID cast failures.
 * - Includes ALTER statements so existing installations can be migrated safely.
 */

module.exports = `
-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Base room registry used by analytics service
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    room_code VARCHAR(20) NOT NULL UNIQUE,
    room_type VARCHAR(20),
    host_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event stream for room-level actions
CREATE TABLE IF NOT EXISTS room_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    user_id TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily room aggregates
CREATE TABLE IF NOT EXISTS room_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL,
    date DATE NOT NULL,
    participant_count INTEGER DEFAULT 0,
    peak_concurrent INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    reaction_count INTEGER DEFAULT 0,
    moment_count INTEGER DEFAULT 0,
    seek_count INTEGER DEFAULT 0,
    play_pause_count INTEGER DEFAULT 0,
    total_watch_time_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(room_id, date)
);

-- Daily user aggregates
CREATE TABLE IF NOT EXISTS user_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    rooms_joined INTEGER DEFAULT 0,
    rooms_created INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    reactions_sent INTEGER DEFAULT 0,
    moments_created INTEGER DEFAULT 0,
    stories_created INTEGER DEFAULT 0,
    stories_viewed INTEGER DEFAULT 0,
    watch_time_minutes INTEGER DEFAULT 0,
    friends_added INTEGER DEFAULT 0,
    invites_sent INTEGER DEFAULT 0,
    achievements_unlocked INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Optional leaderboard/moments tables kept for future features
CREATE TABLE IF NOT EXISTS moment_highlights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL,
    moment_id TEXT NOT NULL,
    timestamp_seconds INTEGER NOT NULL,
    moment_type VARCHAR(50),
    intensity DECIMAL(3,2),
    participant_count INTEGER,
    reaction_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    rank_score DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaderboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period VARCHAR(20),
    user_id TEXT NOT NULL,
    watch_time_rank INTEGER,
    rooms_created_rank INTEGER,
    reactions_rank INTEGER,
    stories_rank INTEGER,
    total_points INTEGER DEFAULT 0,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(period, user_id)
);

-- Migration-safe fixes for older schemas
ALTER TABLE rooms ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE rooms ALTER COLUMN host_id TYPE TEXT USING host_id::text;

ALTER TABLE room_events ALTER COLUMN room_id TYPE TEXT USING room_id::text;
ALTER TABLE room_events ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE room_events ALTER COLUMN data TYPE JSONB USING COALESCE(data::jsonb, '{}'::jsonb);

ALTER TABLE room_analytics ALTER COLUMN room_id TYPE TEXT USING room_id::text;
ALTER TABLE room_analytics ADD COLUMN IF NOT EXISTS participant_count INTEGER DEFAULT 0;
ALTER TABLE room_analytics ADD COLUMN IF NOT EXISTS play_pause_count INTEGER DEFAULT 0;
ALTER TABLE room_analytics ADD COLUMN IF NOT EXISTS seek_count INTEGER DEFAULT 0;
ALTER TABLE room_analytics ADD COLUMN IF NOT EXISTS total_watch_time_minutes INTEGER DEFAULT 0;
ALTER TABLE room_analytics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill from legacy column if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_analytics' AND column_name = 'total_participants'
  ) THEN
    EXECUTE 'UPDATE room_analytics SET participant_count = COALESCE(participant_count, total_participants)';
  END IF;
END $$;

ALTER TABLE user_engagement ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE user_engagement ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE moment_highlights ALTER COLUMN room_id TYPE TEXT USING room_id::text;
ALTER TABLE moment_highlights ALTER COLUMN moment_id TYPE TEXT USING moment_id::text;
ALTER TABLE leaderboards ALTER COLUMN user_id TYPE TEXT USING user_id::text;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_room_events_room_id_created_at ON room_events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_analytics_date ON room_analytics(date);
CREATE INDEX IF NOT EXISTS idx_room_analytics_room_id ON room_analytics(room_id);
CREATE INDEX IF NOT EXISTS idx_user_engagement_user_id ON user_engagement(user_id);
CREATE INDEX IF NOT EXISTS idx_user_engagement_date ON user_engagement(date);
CREATE INDEX IF NOT EXISTS idx_moment_highlights_rank ON moment_highlights(rank_score DESC);

-- Keep updated_at in sync
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_room_analytics_updated_at ON room_analytics;
CREATE TRIGGER update_room_analytics_updated_at
    BEFORE UPDATE ON room_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_engagement_updated_at ON user_engagement;
CREATE TRIGGER update_user_engagement_updated_at
    BEFORE UPDATE ON user_engagement
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;
