-- KEYS[1] = room:code:users (set)
-- KEYS[2] = room:code:metadata (hash)
-- ARGV[1] = userId
-- ARGV[2] = maxParticipants
-- ARGV[3] = currentTime

-- Check if user already in room
local isMember = redis.call('SISMEMBER', KEYS[1], ARGV[1])
if isMember == 1 then
    return {0, "already_in_room"}
end

-- Check room capacity
local currentCount = redis.call('SCARD', KEYS[1])
if currentCount >= tonumber(ARGV[2]) then
    return {0, "room_full"}
end

-- Add user to room
redis.call('SADD', KEYS[1], ARGV[1])

-- Update room metadata
redis.call('HSET', KEYS[2], 'participant_count', currentCount + 1)
redis.call('HSET', KEYS[2], 'last_activity', ARGV[3])

return {1, "joined", currentCount + 1}