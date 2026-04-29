const { Webhook } = require('svix');
const User = require('../models/mongodb/User');
const emailService = require('../services/emailService');

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
      case 'user.created': {
        const savedUser = await syncUser(data);
        // Send welcome email (async, don't block webhook response)
        const email = data.email_addresses?.[0]?.email_address;
        if (email) {
          const name = data.first_name
            ? `${data.first_name} ${data.last_name || ''}`.trim()
            : data.username || 'there';
          emailService.sendWelcomeEmail({ to: email, name }).catch((err) => {
            console.error('[WEBHOOK] Welcome email error:', err.message);
          });
        }
        break;
      }
      
      case 'user.updated':
        await syncUser(data);
        break;
      
      case 'session.created': {
        // Sign-in notification email
        const sessionUser = data?.user || data;
        const signInEmail = sessionUser?.email_addresses?.[0]?.email_address;
        if (signInEmail) {
          const signInName = sessionUser?.first_name
            ? `${sessionUser.first_name} ${sessionUser.last_name || ''}`.trim()
            : sessionUser?.username || 'there';
          emailService.sendSignInEmail({
            to: signInEmail,
            name: signInName,
          }).catch((err) => {
            console.error('[WEBHOOK] Sign-in email error:', err.message);
          });
        }
        break;
      }
      
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