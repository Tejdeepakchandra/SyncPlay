/**
 * PostgreSQL Schema for Analytics
 * Run these SQL commands in Supabase SQL editor
 */

`-- Table: room_analytics
-- Daily aggregate of room activity
CREATE TABLE IF NOT EXISTS room_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    date DATE NOT NULL,
    
    -- Room info
    room_type VARCHAR(20),
    room_status VARCHAR(20),
    host_id UUID,
    
    -- Participant metrics
    total_participants INTEGER DEFAULT 0,
    unique_participants INTEGER DEFAULT 0,
    peak_concurrent INTEGER DEFAULT 0,
    avg_participant_duration INTERVAL,
    
    -- Engagement metrics
    message_count INTEGER DEFAULT 0,
    reaction_count INTEGER DEFAULT 0,
    moment_count INTEGER DEFAULT 0,
    seek_count INTEGER DEFAULT 0,
    play_pause_count INTEGER DEFAULT 0,
    
    -- Watch time
    total_watch_time_minutes INTEGER DEFAULT 0,
    avg_watch_time_minutes INTEGER DEFAULT 0,
    
    -- Story metrics
    story_count INTEGER DEFAULT 0,
    story_views INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(room_id, date)
);

-- Table: user_engagement
-- Daily user activity tracking
CREATE TABLE IF NOT EXISTS user_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    
    -- Activity counts
    rooms_joined INTEGER DEFAULT 0,
    rooms_created INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    reactions_sent INTEGER DEFAULT 0,
    moments_created INTEGER DEFAULT 0,
    stories_created INTEGER DEFAULT 0,
    stories_viewed INTEGER DEFAULT 0,
    
    -- Watch time
    watch_time_minutes INTEGER DEFAULT 0,
    
    -- Social
    friends_added INTEGER DEFAULT 0,
    invites_sent INTEGER DEFAULT 0,
    
    -- Achievement
    achievements_unlocked INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

-- Table: moment_highlights
-- Top moments across all rooms
CREATE TABLE IF NOT EXISTS moment_highlights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    moment_id UUID NOT NULL,
    
    -- Moment data
    timestamp_seconds INTEGER NOT NULL,
    moment_type VARCHAR(50),
    intensity DECIMAL(3,2),
    participant_count INTEGER,
    
    -- Engagement
    reaction_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    
    -- Ranking
    rank_score DECIMAL(5,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: leaderboards
-- Gamification
CREATE TABLE IF NOT EXISTS leaderboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period VARCHAR(20), -- 'daily', 'weekly', 'monthly', 'alltime'
    user_id UUID NOT NULL,
    
    -- Scores
    watch_time_rank INTEGER,
    rooms_created_rank INTEGER,
    reactions_rank INTEGER,
    stories_rank INTEGER,
    
    -- Points
    total_points INTEGER DEFAULT 0,
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(period, user_id)
);

-- Create indexes
CREATE INDEX idx_room_analytics_date ON room_analytics(date);
CREATE INDEX idx_room_analytics_room_id ON room_analytics(room_id);
CREATE INDEX idx_user_engagement_user_id ON user_engagement(user_id);
CREATE INDEX idx_user_engagement_date ON user_engagement(date);
CREATE INDEX idx_moment_highlights_rank ON moment_highlights(rank_score DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to room_analytics
CREATE TRIGGER update_room_analytics_updated_at
    BEFORE UPDATE ON room_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;