const { Webhook } = require('svix');
const User = require('../models/mongodb/User');

/**
 * Clerk Webhook Handler
 * Syncs user data from Clerk to MongoDB
 * Called when user is created, updated, or deleted in Clerk
 */
const clerkWebhook = async (req, res) => {
  try {
    
    // Get raw body - express.raw() gives us a Buffer
    const rawBody = req.body;
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];


    // Verify webhook signature
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
    
    let evt;
    try {
      evt = wh.verify(bodyStr, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      console.error('   ❌ Webhook signature verification failed:', err.message);
      console.error('   Secret present:', !!process.env.CLERK_WEBHOOK_SECRET);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const eventType = evt.type;
    const data = evt.data;


    switch (eventType) {
      case 'user.created':
        await syncUser(data);
        break;
      
      case 'user.updated':
        await syncUser(data);
        break;
      
      case 'user.deleted':
        await deleteUser(data.id);
        break;
      
      default:
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
    const email = clerkUser.email_addresses?.[0]?.email_address;
    const username = clerkUser.username || email?.split('@')[0] || `user_${clerkUser.id.slice(-6)}`;
    

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


    const result = await User.findOneAndUpdate(
      { clerkId: clerkUser.id },
      userData,
      { upsert: true, new: true }
    );

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
};

module.exports = { clerkWebhook, syncUser };