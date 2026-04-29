const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const FROM_EMAIL = 'SyncPlay <onboarding@resend.dev>'; // Use your verified domain in production

let resend = null;

function getResend() {
  if (!RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

function isConfigured() {
  return !!RESEND_API_KEY;
}

// ─── Shared HTML wrapper ───────────────────────────────────────────

function wrapHtml(bodyContent) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; padding: 0; background: #0a0e14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo-text { font-size: 28px; font-weight: 800; background: linear-gradient(135deg, #34d399, #a3e635); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.5px; }
    .card { background: #111827; border: 1px solid rgba(52, 211, 153, 0.15); border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    h1 { font-size: 22px; margin: 0 0 12px; color: #f1f5f9; }
    p { font-size: 15px; line-height: 1.7; color: #94a3b8; margin: 0 0 16px; }
    .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #34d399, #a3e635); color: #064e3b !important; font-weight: 700; font-size: 14px; border-radius: 10px; text-decoration: none; margin: 8px 0 16px; }
    .footer { text-align: center; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); }
    .footer p { font-size: 12px; color: #475569; }
    .highlight { color: #34d399; font-weight: 600; }
    .muted { color: #64748b; font-size: 13px; }
    .room-code { display: inline-block; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.25); border-radius: 8px; padding: 8px 16px; font-family: monospace; font-size: 18px; font-weight: 700; color: #34d399; letter-spacing: 2px; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <span class="logo-text">🎬 SyncPlay</span>
    </div>
    ${bodyContent}
    <div class="footer">
      <p>SyncPlay — Watch together, vibe together.</p>
      <p>You're receiving this because you signed up at SyncPlay.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Welcome Email (Signup) ────────────────────────────────────────

async function sendWelcomeEmail({ to, name }) {
  const client = getResend();
  if (!client) {
    console.log('[EMAIL] Resend not configured — skipping welcome email to', to);
    return null;
  }

  const displayName = name || 'there';

  try {
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Welcome to SyncPlay, ${displayName}! 🎬🎵`,
      html: wrapHtml(`
        <div class="card">
          <h1>Welcome to SyncPlay! 🎉</h1>
          <p>Hey <span class="highlight">${displayName}</span>,</p>
          <p>You've just joined the ultimate watch-together experience. Create rooms, invite friends, and enjoy movies & music in perfect sync.</p>
          <p>Here's what you can do:</p>
          <p>
            🎬 <strong>Movie Rooms</strong> — Watch YouTube or uploaded videos together<br/>
            🎵 <strong>Music Rooms</strong> — Listen to music with friends in real-time<br/>
            🎤 <strong>Voice Chat</strong> — Talk while you watch or listen<br/>
            📸 <strong>Moments</strong> — Capture and share highlights
          </p>
          <a href="${CLIENT_URL}" class="btn">Start Watching →</a>
          <p class="muted">Create your first room and invite friends to experience synchronized playback.</p>
        </div>
      `),
    });

    if (error) {
      console.error('[EMAIL] Welcome email failed:', error);
      return null;
    }

    console.log('[EMAIL] ✅ Welcome email sent to', to, '| id:', data?.id);
    return data;
  } catch (err) {
    console.error('[EMAIL] Welcome email error:', err.message);
    return null;
  }
}

// ─── Sign-In Notification ──────────────────────────────────────────

async function sendSignInEmail({ to, name, ipAddress, device }) {
  const client = getResend();
  if (!client) return null;

  const displayName = name || 'there';
  const time = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  try {
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `New sign-in to your SyncPlay account`,
      html: wrapHtml(`
        <div class="card">
          <h1>New Sign-In Detected 🔐</h1>
          <p>Hey <span class="highlight">${displayName}</span>,</p>
          <p>We noticed a new sign-in to your SyncPlay account:</p>
          <p>
            📅 <strong>Time:</strong> ${time}<br/>
            ${ipAddress ? `🌐 <strong>IP:</strong> ${ipAddress}<br/>` : ''}
            ${device ? `💻 <strong>Device:</strong> ${device}<br/>` : ''}
          </p>
          <p>If this was you, no action is needed. If you didn't sign in, please secure your account immediately.</p>
          <a href="${CLIENT_URL}" class="btn">Go to SyncPlay</a>
        </div>
      `),
    });

    if (error) {
      console.error('[EMAIL] Sign-in email failed:', error);
      return null;
    }

    console.log('[EMAIL] ✅ Sign-in email sent to', to);
    return data;
  } catch (err) {
    console.error('[EMAIL] Sign-in email error:', err.message);
    return null;
  }
}

// ─── Room Invite Email (for offline friends) ───────────────────────

async function sendRoomInviteEmail({ to, inviterName, roomName, roomCode, roomType }) {
  const client = getResend();
  if (!client) {
    console.log('[EMAIL] Resend not configured — skipping invite email to', to);
    return null;
  }

  const roomPath = roomType === 'music' ? `/music/room/${roomCode}` : `/room/${roomCode}`;
  const joinUrl = `${CLIENT_URL}${roomPath}`;
  const typeEmoji = roomType === 'music' ? '🎵' : '🎬';

  try {
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `${inviterName} invited you to "${roomName}" on SyncPlay ${typeEmoji}`,
      html: wrapHtml(`
        <div class="card">
          <h1>${typeEmoji} You're Invited!</h1>
          <p><span class="highlight">${inviterName}</span> wants you to join their ${roomType} room:</p>
          <p style="text-align:center; margin: 20px 0;">
            <strong style="font-size: 18px; color: #f1f5f9;">"${roomName}"</strong>
          </p>
          <p style="text-align:center;">
            <span class="room-code">${roomCode}</span>
          </p>
          <p style="text-align:center;">
            <a href="${joinUrl}" class="btn">Join Room Now →</a>
          </p>
          <p class="muted">This invite link will work as long as the room is active. Rooms automatically close after 5 hours.</p>
        </div>
      `),
    });

    if (error) {
      console.error('[EMAIL] Invite email failed:', error);
      return null;
    }

    console.log('[EMAIL] ✅ Room invite email sent to', to, 'for room', roomCode);
    return data;
  } catch (err) {
    console.error('[EMAIL] Invite email error:', err.message);
    return null;
  }
}

// ─── Friend Request Email ──────────────────────────────────────────

async function sendFriendRequestEmail({ to, fromName, toName }) {
  const client = getResend();
  if (!client) return null;

  const displayTo = toName || 'there';

  try {
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `${fromName} wants to be your friend on SyncPlay`,
      html: wrapHtml(`
        <div class="card">
          <h1>New Friend Request 🤝</h1>
          <p>Hey <span class="highlight">${displayTo}</span>,</p>
          <p><span class="highlight">${fromName}</span> sent you a friend request on SyncPlay!</p>
          <p>Accept it to start watching movies and listening to music together.</p>
          <a href="${CLIENT_URL}/friends" class="btn">View Request →</a>
          <p class="muted">You can also find this in your notifications within the app.</p>
        </div>
      `),
    });

    if (error) {
      console.error('[EMAIL] Friend request email failed:', error);
      return null;
    }

    console.log('[EMAIL] ✅ Friend request email sent to', to);
    return data;
  } catch (err) {
    console.error('[EMAIL] Friend request email error:', err.message);
    return null;
  }
}

module.exports = {
  isConfigured,
  sendWelcomeEmail,
  sendSignInEmail,
  sendRoomInviteEmail,
  sendFriendRequestEmail,
};
