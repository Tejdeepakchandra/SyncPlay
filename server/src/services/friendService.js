const Friendship = require('../models/mongodb/Friendship');
const User = require('../models/mongodb/User');

const DEFAULT_AVATAR_EMOJI = '🧑';

const toPublicProfile = (userDoc) => {
  if (!userDoc) return null;
  return {
    id: userDoc.clerkId,
    display_name: userDoc.displayName || userDoc.username || 'User',
    username: userDoc.username || 'user',
    avatar_emoji: userDoc.avatar_emoji || DEFAULT_AVATAR_EMOJI,
    is_online: !!userDoc.isOnline,
    status: userDoc.currentRoom ? 'In a room' : (userDoc.isOnline ? 'Online' : 'Offline'),
    bio: userDoc.bio || null,
  };
};

const ensureUserExists = async (clerkId) => {
  let user = await User.findOne({ clerkId });
  if (user) return user;

  const safeSuffix = String(clerkId).slice(-6).toLowerCase();
  user = await User.create({
    clerkId,
    email: `user-${safeSuffix}@syncplay.local`,
    username: `user_${safeSuffix}`,
    displayName: 'User',
    avatar: 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
  });

  return user;
};

const recalcFriendCounts = async (clerkIds) => {
  const uniqueIds = [...new Set((clerkIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) return;

  for (const clerkId of uniqueIds) {
    const count = await Friendship.countDocuments({
      status: 'accepted',
      $or: [{ requesterId: clerkId }, { addresseeId: clerkId }],
    });

    await User.updateOne({ clerkId }, { $set: { 'stats.friendsCount': count } });
  }
};

const getConnectedIds = async (userId) => {
  const links = await Friendship.find({
    $or: [{ requesterId: userId }, { addresseeId: userId }],
  })
    .select('requesterId addresseeId status')
    .lean();

  const connected = new Set([userId]);
  const sentPending = new Set();

  links.forEach((f) => {
    connected.add(f.requesterId);
    connected.add(f.addresseeId);
    if (f.status === 'pending' && f.requesterId === userId) {
      sentPending.add(f.addresseeId);
    }
  });

  return { connected, sentPending };
};

const friendService = {
  async getOverview(userId, { search = '', discoverLimit = 20 } = {}) {
    const accepted = await Friendship.find({
      status: 'accepted',
      $or: [{ requesterId: userId }, { addresseeId: userId }],
    })
      .sort({ updatedAt: -1 })
      .lean();

    const incoming = await Friendship.find({
      status: 'pending',
      addresseeId: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const { connected, sentPending } = await getConnectedIds(userId);

    const profileIds = new Set();
    accepted.forEach((f) => {
      profileIds.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
    });
    incoming.forEach((f) => profileIds.add(f.requesterId));

    const profiles = await User.find({ clerkId: { $in: [...profileIds] } })
      .select('clerkId displayName username bio isOnline currentRoom avatar_emoji')
      .lean();
    const profileMap = new Map(profiles.map((u) => [u.clerkId, u]));

    const friends = accepted
      .map((f) => {
        const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
        const other = profileMap.get(otherId);
        if (!other) return null;
        return {
          id: f._id.toString(),
          friendProfile: toPublicProfile(other),
        };
      })
      .filter(Boolean);

    const requests = incoming
      .map((f) => {
        const requester = profileMap.get(f.requesterId);
        if (!requester) return null;
        return {
          id: f._id.toString(),
          requester: toPublicProfile(requester),
          created_at: f.createdAt,
        };
      })
      .filter(Boolean);

    const discoverQuery = {
      clerkId: { $nin: [...connected] },
    };

    if (search) {
      discoverQuery.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const suggestedDocs = await User.find(discoverQuery)
      .select('clerkId displayName username bio isOnline currentRoom avatar_emoji')
      .sort({ isOnline: -1, lastActive: -1 })
      .limit(discoverLimit)
      .lean();

    const suggestedUsers = suggestedDocs.map(toPublicProfile);

    return {
      friends,
      requests,
      suggestedUsers,
      sentRequestIds: [...sentPending],
    };
  },

  async sendRequest(requesterId, addresseeId) {
    if (!requesterId || !addresseeId) throw new Error('Missing user ids');
    if (requesterId === addresseeId) throw new Error('Cannot send friend request to yourself');

    await Promise.all([ensureUserExists(requesterId), ensureUserExists(addresseeId)]);

    const pairKey = Friendship.buildPairKey(requesterId, addresseeId);
    const existing = await Friendship.findOne({ pairKey });

    if (!existing) {
      return Friendship.create({
        requesterId,
        addresseeId,
        pairKey,
        status: 'pending',
      });
    }

    if (existing.status === 'accepted') {
      throw new Error('Already friends');
    }

    if (existing.status === 'pending') {
      if (existing.requesterId === requesterId) {
        throw new Error('Friend request already sent');
      }

      existing.status = 'accepted';
      existing.acceptedAt = new Date();
      await existing.save();
      await recalcFriendCounts([requesterId, addresseeId]);
      return existing;
    }

    // Re-open rejected connection as pending from current requester.
    existing.requesterId = requesterId;
    existing.addresseeId = addresseeId;
    existing.status = 'pending';
    existing.acceptedAt = null;
    await existing.save();
    return existing;
  },

  async cancelSentRequest(requesterId, addresseeId) {
    const pairKey = Friendship.buildPairKey(requesterId, addresseeId);
    await Friendship.deleteOne({ pairKey, requesterId, addresseeId, status: 'pending' });
  },

  async acceptRequest(currentUserId, friendshipId) {
    const friendship = await Friendship.findOne({ _id: friendshipId, addresseeId: currentUserId, status: 'pending' });
    if (!friendship) throw new Error('Request not found');

    friendship.status = 'accepted';
    friendship.acceptedAt = new Date();
    await friendship.save();
    await recalcFriendCounts([friendship.requesterId, friendship.addresseeId]);
    return friendship;
  },

  async declineRequest(currentUserId, friendshipId) {
    const friendship = await Friendship.findOne({ _id: friendshipId, addresseeId: currentUserId, status: 'pending' }).lean();
    if (!friendship) {
      return null;
    }

    await Friendship.deleteOne({ _id: friendshipId, addresseeId: currentUserId, status: 'pending' });
    return {
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
    };
  },

  async removeFriend(currentUserId, friendshipId) {
    const friendship = await Friendship.findOne({
      _id: friendshipId,
      status: 'accepted',
      $or: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
    });

    if (!friendship) throw new Error('Friendship not found');

    const affected = [friendship.requesterId, friendship.addresseeId];
    await Friendship.deleteOne({ _id: friendshipId });
    await recalcFriendCounts(affected);
    return affected;
  },

  async getSummary(currentUserId) {
    const [friendsCount, incomingRequests] = await Promise.all([
      Friendship.countDocuments({
        status: 'accepted',
        $or: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
      }),
      Friendship.countDocuments({ status: 'pending', addresseeId: currentUserId }),
    ]);

    return {
      friendsCount,
      incomingRequests,
    };
  },
};

module.exports = friendService;
