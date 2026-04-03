const { Webhook } = require('svix');
const User = require('../models/mongodb/User');

/**
 * Clerk Webhook Handler
 * Syncs user data from Clerk to MongoDB
 * Called when user is created, updated, or deleted in Clerk
 */
const clerkWebhook = async (req, res) => {
  try {
    console.log('🔔 CLERK WEBHOOK RECEIVED');
    
    // Get raw body - express.raw() gives us a Buffer
    const rawBody = req.body;
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];

    console.log('   Event ID:', svixId);
    console.log('   Signature:', svixSignature?.substring(0, 20) + '...');

    // Verify webhook signature
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
    
    let evt;
    try {
      evt = wh.verify(bodyStr, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
      console.log('   ✅ Webhook signature verified');
    } catch (err) {
      console.error('   ❌ Webhook signature verification failed:', err.message);
      console.error('   Secret present:', !!process.env.CLERK_WEBHOOK_SECRET);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const eventType = evt.type;
    const data = evt.data;

    console.log(`   Event type: ${eventType}`);
    console.log('   User ID:', data?.id);
    console.log('   Email:', data?.email_addresses?.[0]?.email_address);

    switch (eventType) {
      case 'user.created':
        console.log('   👤 Creating new user...');
        await syncUser(data);
        break;
      
      case 'user.updated':
        console.log('   ♻️ Updating user...');
        await syncUser(data);
        break;
      
      case 'user.deleted':
        console.log('   🗑️ Deleting user...');
        await deleteUser(data.id);
        break;
      
      default:
        console.log(`   ⚠️ Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('   ❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Sync user from Clerk to MongoDB
 */
const syncUser = async (clerkUser) => {
  try {
    console.log('   📝 syncUser called for:', clerkUser.id);
    const email = clerkUser.email_addresses?.[0]?.email_address;
    const username = clerkUser.username || email?.split('@')[0] || `user_${clerkUser.id.slice(-6)}`;
    
    console.log('      Email:', email);
    console.log('      Username:', username);

    const userData = {
      clerkId: clerkUser.id,
      username: username,
      displayName: clerkUser.first_name 
        ? `${clerkUser.first_name} ${clerkUser.last_name || ''}`.trim()
        : username,
      email: email,
      avatar: clerkUser.image_url || 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
      lastActive: new Date(),
      isOnline: true
    };

    console.log('      Upserting user to MongoDB with data:', userData);

    const result = await User.findOneAndUpdate(
      { clerkId: clerkUser.id },
      userData,
      { upsert: true, new: true }
    );

    console.log(`      ✅ User synced successfully: ${result._id} (${username})`);
    return result;
  } catch (error) {
    console.error('      ❌ Error syncing user:', error.message);
    throw error;
  }
};

/**
 * Delete user from MongoDB when deleted from Clerk
 */
const deleteUser = async (clerkId) => {
  await User.findOneAndDelete({ clerkId });
  console.log(`User deleted: ${clerkId}`);
};

module.exports = { clerkWebhook, syncUser };