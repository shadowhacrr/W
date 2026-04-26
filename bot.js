require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const db = require('./database');

// ===================== CONFIG =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
const REQUIRED_GROUP = process.env.REQUIRED_GROUP;
const YOUTUBE_LINK = process.env.YOUTUBE_LINK || 'https://youtube.com/@yourchannel';
const WHATSAPP_LINK = process.env.WHATSAPP_LINK || 'https://whatsapp.com/channel/yourchannel';
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '+1234567890';
const ADMIN_TELEGRAM = process.env.ADMIN_TELEGRAM || '@admin';

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error('❌ BOT_TOKEN and ADMIN_ID are required in .env file');
  process.exit(1);
}

// ===================== INIT BOT =====================
const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    autoStart: true,
    params: { timeout: 10 }
  }
});

let botInfo = null;
const userStates = {}; // in-memory conversation state

async function initBot() {
  try {
    botInfo = await bot.getMe();
    console.log(`🤖 Bot started successfully: @${botInfo.username}`);
    console.log(`👤 Admin ID: ${ADMIN_ID}`);
  } catch (e) {
    console.error('❌ Failed to start bot:', e.message);
    process.exit(1);
  }
}
initBot();

// ===================== UTILITIES =====================
function isAdmin(userId) {
  return String(userId) === String(ADMIN_ID);
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()`~>#+\-=|{}.!]/g, '\\$&');
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getOrCreateUser(userId, username = '', firstName = '') {
  let user = db.users.get(userId);
  if (!user) {
    user = {
      id: userId,
      username: username || '',
      firstName: firstName || '',
      joinedAt: new Date().toISOString(),
      verified: { telegramChannel: false, telegramGroup: false, youtube: false, whatsapp: false },
      verifiedAt: null,
      dailyLimit: 200,
      dailyUsed: 0,
      lastUsedDate: getToday(),
      projectsCount: 0,
      totalReactionsSent: 0,
      isAdmin: isAdmin(userId)
    };
    db.users.set(userId, user);
    db.stats.update(s => ({ ...s, totalUsers: (s.totalUsers || 0) + 1 }));
  }
  return user;
}

function getRemainingLimit(user) {
  const today = getToday();
  if (user.lastUsedDate !== today) {
    user.dailyUsed = 0;
    user.lastUsedDate = today;
    db.users.set(user.id, user);
  }
  return Math.max(0, user.dailyLimit - user.dailyUsed);
}

function deductLimit(userId, amount = 1) {
  const user = db.users.get(userId);
  if (!user) return false;
  if (user.isAdmin) return true; // Admin has unlimited
  const today = getToday();
  if (user.lastUsedDate !== today) {
    user.dailyUsed = 0;
    user.lastUsedDate = today;
  }
  user.dailyUsed += amount;
  user.totalReactionsSent = (user.totalReactionsSent || 0) + amount;
  db.users.set(userId, user);
  return true;
}

function extractChatId(text) {
  if (!text) return null;
  text = text.trim();

  // Direct -100 ID or numeric ID
  if (/^-\d+$/.test(text)) return text;

  // @username
  if (text.startsWith('@')) return text;

  // Public link: https://t.me/username or t.me/username
  const publicMatch = text.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{5,})/i);
  if (publicMatch) return '@' + publicMatch[1];

  // Private link: t.me/+xxxx
  const privateMatch = text.match(/(?:https?:\/\/)?t\.me\/\+/i);
  if (privateMatch) return 'PRIVATE_LINK';

  return null;
}

// ===================== API HELPERS =====================
async function checkMembership(userId, chatId) {
  try {
    if (!chatId) return false;
    const res = await bot.getChatMember(chatId, userId);
    return ['member', 'administrator', 'creator'].includes(res.status);
  } catch (e) {
    console.error(`Membership check failed for ${chatId}:`, e.message);
    return false;
  }
}

async function isBotAdmin(chatId) {
  try {
    if (!botInfo) botInfo = await bot.getMe();
    const res = await bot.getChatMember(chatId, botInfo.id);
    return ['administrator', 'creator'].includes(res.status);
  } catch (e) {
    console.error(`Bot admin check failed for ${chatId}:`, e.message);
    return false;
  }
}

async function sendReaction(chatId, messageId, emoji) {
  try {
    const res = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setMessageReaction`, {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: emoji }],
      is_big: false
    });
    return res.data && res.data.ok === true;
  } catch (e) {
    const desc = e.response?.data?.description || e.message;
    console.error(`Reaction failed in ${chatId} msg ${messageId}:`, desc);
    return false;
  }
}

// ===================== KEYBOARDS =====================
function getVerificationKeyboard(user) {
  const v = user.verified || {};
  const ch = v.telegramChannel ? '✅' : '❌';
  const gr = v.telegramGroup ? '✅' : '❌';
  const yt = v.youtube ? '✅' : '❌';
  const wa = v.whatsapp ? '✅' : '❌';

  return {
    inline_keyboard: [
      [
        { text: `${ch} Telegram Channel`, callback_data: 'verify_channel' },
        { text: `${gr} Telegram Group`, callback_data: 'verify_group' }
      ],
      [
        { text: `${yt} YouTube Channel`, callback_data: 'verify_youtube' },
        { text: `${wa} WhatsApp Channel`, callback_data: 'verify_whatsapp' }
      ],
      [{ text: '🚀 Verify & Start Bot', callback_data: 'verify_all' }]
    ]
  };
}

function getEmojiKeyboard() {
  const emojis = ['👍', '❤️', '🔥', '🥳', '👏', '🤯', '😢', '🎉', '🤩', '🤬'];
  const buttons = emojis.map(e => ({ text: e, callback_data: `emoji_${e}` }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(buttons.slice(i, i + 5));
  }
  rows.push([{ text: '❌ Cancel', callback_data: 'cancel_add' }]);
  return { inline_keyboard: rows };
}

function getMainKeyboard(userId) {
  const isAdm = isAdmin(userId);
  const rows = [
    [
      { text: '➕ Add Project', callback_data: 'add_project' },
      { text: '📂 My Projects', callback_data: 'my_projects' }
    ],
    [
      { text: '📊 Statistics', callback_data: 'stats' },
      { text: '💰 Recharge', callback_data: 'recharge' }
    ]
  ];
  if (isAdm) {
    rows.push([{ text: '🔒 Admin Panel', callback_data: 'admin_panel' }]);
  }
  return { inline_keyboard: rows };
}

function getAdminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
        { text: '➕ Add Limit', callback_data: 'admin_addlimit' }
      ],
      [
        { text: '📊 All Stats', callback_data: 'admin_stats' },
        { text: '👥 Users', callback_data: 'admin_users' }
      ],
      [{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]
    ]
  };
}

// ===================== TEXT BUILDERS =====================
function getWelcomeText(user, isVerified) {
  if (!isVerified) {
    return `👋 *Welcome to Premium Auto-React Bot!*

🚀 This bot auto-sends reactions to your Telegram channel and group posts.

🔒 *Complete ALL 4 steps below to unlock the bot:*

1️⃣ Join Telegram Channel
2️⃣ Join Telegram Group
3️⃣ Subscribe YouTube Channel
4️⃣ Join WhatsApp Channel

✅ Click *Verify & Start Bot* when done!`;
  }
  const remaining = getRemainingLimit(user);
  const projects = db.projects.getByUser(user.id) || [];
  return `🎉 *Welcome Back, ${escapeMarkdown(user.firstName || 'User')}!*

Use the buttons below to manage your projects.

💡 *Daily Limit:* ${remaining} reactions remaining
📂 *Active Projects:* ${projects.filter(p => p.active).length}`;
}

// ===================== COMMANDS =====================
bot.onText(/\/start/, async (msg) => {
  try {
    const userId = msg.from.id;
    const user = getOrCreateUser(userId, msg.from.username, msg.from.first_name);
    const isVerified = !!user.verifiedAt;

    bot.sendMessage(msg.chat.id, getWelcomeText(user, isVerified), {
      parse_mode: 'Markdown',
      reply_markup: isVerified ? getMainKeyboard(userId) : getVerificationKeyboard(user)
    });
  } catch (e) {
    console.error('/start error:', e.message);
  }
});

// Admin command: /addlimit user_id amount
bot.onText(/\/addlimit\s+(\d+)\s+(\d+)/, async (msg, match) => {
  try {
    if (!isAdmin(msg.from.id)) return;
    const targetId = match[1];
    const amount = parseInt(match[2]);

    const target = db.users.get(targetId);
    if (!target) {
      return bot.sendMessage(msg.chat.id, '❌ User not found in database.');
    }

    target.dailyLimit = amount;
    db.users.set(targetId, target);

    bot.sendMessage(msg.chat.id, `✅ *Limit Updated*\n\nUser: \`${targetId}\`\nNew Daily Limit: *${amount}* reactions`, { parse_mode: 'Markdown' });

    try {
      bot.sendMessage(targetId, `🎉 *Good News!*\n\nAdmin has updated your daily limit to *${amount}* reactions. Enjoy!`, { parse_mode: 'Markdown' });
    } catch (e) {}
  } catch (e) {
    console.error('/addlimit error:', e.message);
  }
});

// Admin command: /broadcast message
bot.onText(/\/broadcast\s+([\s\S]+)/, async (msg, match) => {
  try {
    if (!isAdmin(msg.from.id)) return;
    const text = match[1];
    if (!text.trim()) return bot.sendMessage(msg.chat.id, 'Usage: /broadcast Your message here');

    const users = db.users.getAll();
    const activeProjects = db.projects.getAllActive();
    const uniqueChats = [...new Set(activeProjects.map(p => p.channelId))];

    let userSent = 0, userFail = 0;
    let chatSent = 0, chatFail = 0;

    for (const uid in users) {
      try {
        await bot.sendMessage(uid, `📢 *Broadcast from Admin:*\n\n${text}`, { parse_mode: 'Markdown' });
        userSent++;
      } catch (e) { userFail++; }
    }

    for (const chatId of uniqueChats) {
      try {
        await bot.sendMessage(chatId, `📢 *Broadcast:*\n\n${text}`, { parse_mode: 'Markdown' });
        chatSent++;
      } catch (e) { chatFail++; }
    }

    bot.sendMessage(msg.chat.id, `✅ *Broadcast Complete*\n\n👤 Users: ${userSent} sent, ${userFail} failed\n💬 Channels/Groups: ${chatSent} sent, ${chatFail} failed`, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('/broadcast error:', e.message);
  }
});

// Fallback /broadcast without regex match
bot.onText(/\/broadcast$/, (msg) => {
  if (isAdmin(msg.from.id)) {
    bot.sendMessage(msg.chat.id, 'Usage: /broadcast Your message here');
  }
});

// ===================== CALLBACK HANDLERS =====================
bot.on('callback_query', async (query) => {
  try {
    await bot.answerCallbackQuery(query.id);
  } catch (e) {}

  const data = query.data;
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;

  try {
    const user = getOrCreateUser(userId, query.from.username, query.from.first_name);

    // ─── VERIFICATION CALLBACKS ───
    if (data === 'verify_channel') {
      if (!REQUIRED_CHANNEL) {
        return bot.answerCallbackQuery(query.id, { text: 'Channel not configured!', show_alert: true });
      }
      const joined = await checkMembership(userId, REQUIRED_CHANNEL);
      user.verified.telegramChannel = joined;
      db.users.set(userId, user);

      bot.answerCallbackQuery(query.id, {
        text: joined ? '✅ Telegram Channel verified!' : '❌ You have not joined! Click the link first.',
        show_alert: !joined
      });
      return bot.editMessageReplyMarkup(getVerificationKeyboard(user), { chat_id: chatId, message_id: msgId });
    }

    if (data === 'verify_group') {
      if (!REQUIRED_GROUP) {
        return bot.answerCallbackQuery(query.id, { text: 'Group not configured!', show_alert: true });
      }
      const joined = await checkMembership(userId, REQUIRED_GROUP);
      user.verified.telegramGroup = joined;
      db.users.set(userId, user);

      bot.answerCallbackQuery(query.id, {
        text: joined ? '✅ Telegram Group verified!' : '❌ You have not joined! Click the link first.',
        show_alert: !joined
      });
      return bot.editMessageReplyMarkup(getVerificationKeyboard(user), { chat_id: chatId, message_id: msgId });
    }

    if (data === 'verify_youtube') {
      return bot.editMessageText('📺 *Subscribe to YouTube Channel*\n\nClick below to open YouTube, subscribe, then come back and click *Done*.', {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📺 Open YouTube', url: YOUTUBE_LINK }],
            [{ text: '✅ Done, I Subscribed', callback_data: 'youtube_done' }],
            [{ text: '🔙 Back', callback_data: 'back_verify' }]
          ]
        }
      });
    }

    if (data === 'youtube_done') {
      user.verified.youtube = true;
      db.users.set(userId, user);
      bot.answerCallbackQuery(query.id, { text: '✅ YouTube marked as done!' });
      return bot.editMessageText(getWelcomeText(user, false), {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getVerificationKeyboard(user)
      });
    }

    if (data === 'verify_whatsapp') {
      return bot.editMessageText('💬 *Join WhatsApp Channel*\n\nClick below to open WhatsApp, join the channel, then come back and click *Done*.', {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Open WhatsApp', url: WHATSAPP_LINK }],
            [{ text: '✅ Done, I Joined', callback_data: 'whatsapp_done' }],
            [{ text: '🔙 Back', callback_data: 'back_verify' }]
          ]
        }
      });
    }

    if (data === 'whatsapp_done') {
      user.verified.whatsapp = true;
      db.users.set(userId, user);
      bot.answerCallbackQuery(query.id, { text: '✅ WhatsApp marked as done!' });
      return bot.editMessageText(getWelcomeText(user, false), {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getVerificationKeyboard(user)
      });
    }

    if (data === 'verify_all') {
      const v = user.verified;
      const allDone = v.telegramChannel && v.telegramGroup && v.youtube && v.whatsapp;

      if (!allDone) {
        const missing = [];
        if (!v.telegramChannel) missing.push('Telegram Channel');
        if (!v.telegramGroup) missing.push('Telegram Group');
        if (!v.youtube) missing.push('YouTube');
        if (!v.whatsapp) missing.push('WhatsApp');
        return bot.answerCallbackQuery(query.id, {
          text: `❌ Complete all steps first!\nMissing: ${missing.join(', ')}`,
          show_alert: true
        });
      }

      user.verifiedAt = new Date().toISOString();
      db.users.set(userId, user);

      bot.answerCallbackQuery(query.id, { text: '🎉 Welcome! Bot is now unlocked.' });
      return bot.editMessageText(`🎉 *Verification Complete!*\n\n✅ Welcome to Premium Auto-React Bot.\n\nYou can now add your channels and groups.`, {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getMainKeyboard(userId)
      });
    }

    if (data === 'back_verify') {
      return bot.editMessageText(getWelcomeText(user, false), {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getVerificationKeyboard(user)
      });
    }

    // ─── MAIN MENU CALLBACKS ───
    if (data === 'main_menu') {
      return bot.editMessageText(getWelcomeText(user, true), {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getMainKeyboard(userId)
      });
    }

    if (data === 'add_project') {
      userStates[userId] = { step: 'awaiting_link', data: {} };
      return bot.editMessageText('➕ *Add New Project*\n\nSend your channel or group link/username.\n\n*Supported formats:*\n• @channelname\n• https://t.me/channelname\n• -100xxxxxxxxx (channel ID)\n\n⚠️ *Important:* Bot must be an **admin** in your channel/group with *Post Reactions* permission.', {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_add' }]] }
      });
    }

    if (data === 'cancel_add') {
      userStates[userId] = { step: 'idle', data: {} };
      return bot.editMessageText('❌ Cancelled.', {
        chat_id: chatId, message_id: msgId, reply_markup: getMainKeyboard(userId)
      });
    }

    if (data.startsWith('emoji_')) {
      if (userStates[userId]?.step !== 'awaiting_emoji') return;
      const emoji = data.replace('emoji_', '');
      userStates[userId].data.emoji = emoji;
      userStates[userId].step = 'awaiting_count';

      return bot.sendMessage(chatId, `✅ Emoji selected: ${emoji}\n\nNow send how many posts to react to (1-500):\n\nThis is the maximum number of new posts I will auto-react to.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_add' }]] }
      });
    }

    if (data === 'confirm_project') {
      if (userStates[userId]?.step !== 'awaiting_confirm') return;
      const projData = userStates[userId].data;

      const project = {
        id: 'p_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        channelId: String(projData.channelId),
        channelLink: projData.channelLink,
        emoji: projData.emoji,
        maxReacts: parseInt(projData.count) || 100,
        reactedCount: 0,
        addedAt: new Date().toISOString(),
        active: true
      };

      db.projects.add(userId, project);
      db.stats.update(s => ({ ...s, totalProjects: (s.totalProjects || 0) + 1 }));

      user.projectsCount = (user.projectsCount || 0) + 1;
      db.users.set(userId, user);

      userStates[userId] = { step: 'idle', data: {} };

      return bot.editMessageText(`✅ *Project Added Successfully!*\n\n🔗 Channel/Group: ${escapeMarkdown(projData.channelLink)}\n😊 Emoji: ${projData.emoji}\n🔢 Max Reactions: ${project.maxReacts}\n\n🤖 Bot will now auto-react to new posts in this channel/group until the limit is reached.`, {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getMainKeyboard(userId)
      });
    }

    if (data === 'my_projects') {
      const projects = db.projects.getByUser(userId);
      if (!projects || projects.length === 0) {
        return bot.answerCallbackQuery(query.id, { text: 'No projects yet! Add one first.', show_alert: true });
      }

      let text = '📂 *Your Projects*\n\n';
      const kb = [];
      projects.forEach((p, i) => {
        const status = p.active ? '🟢' : '🔴';
        text += `${i + 1}. ${escapeMarkdown(p.channelLink)}\n   ${p.emoji} | Max: ${p.maxReacts} | Used: ${p.reactedCount || 0} | ${status}\n\n`;
        kb.push([{ text: `${status} ${p.channelLink.substring(0, 22)}`, callback_data: `toggle_${p.id}` }]);
      });
      kb.push([{ text: '🔙 Back', callback_data: 'main_menu' }]);

      return bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    }

    if (data.startsWith('toggle_')) {
      const projId = data.replace('toggle_', '');
      const projects = db.projects.getByUser(userId);
      const proj = projects.find(p => p.id === projId);
      if (proj) {
        proj.active = !proj.active;
        db.projects.set(userId, projects);
        bot.answerCallbackQuery(query.id, { text: proj.active ? 'Activated!' : 'Deactivated!' });
      }

      // Refresh view
      const updated = db.projects.getByUser(userId);
      let text = '📂 *Your Projects*\n\n';
      const kb = [];
      updated.forEach((p, i) => {
        const status = p.active ? '🟢' : '🔴';
        text += `${i + 1}. ${escapeMarkdown(p.channelLink)}\n   ${p.emoji} | Max: ${p.maxReacts} | Used: ${p.reactedCount || 0} | ${status}\n\n`;
        kb.push([{ text: `${status} ${p.channelLink.substring(0, 22)}`, callback_data: `toggle_${p.id}` }]);
      });
      kb.push([{ text: '🔙 Back', callback_data: 'main_menu' }]);

      return bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    }

    if (data === 'stats') {
      const stats = db.stats.get();
      const allUsers = db.users.getAll();
      const myProjects = db.projects.getByUser(userId) || [];

      return bot.editMessageText(`📊 *Bot Statistics*\n\n👥 Total Users: ${Object.keys(allUsers).length}\n📂 Total Projects: ${stats.totalProjects || 0}\n🎉 Total Reactions: ${stats.totalReactions || 0}\n\n💡 *Your Stats:*\n📂 Projects: ${myProjects.length}\n🎉 Sent: ${user.totalReactionsSent || 0}\n💰 Daily Limit: ${user.dailyLimit}\n🔋 Remaining Today: ${getRemainingLimit(user)}`, {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]] }
      });
    }

    if (data === 'recharge') {
      return bot.editMessageText(`💰 *Recharge Credits*\n\nTo increase your daily reaction limit, contact the admin:\n\n📱 WhatsApp: ${escapeMarkdown(ADMIN_WHATSAPP)}\n💬 Telegram: ${escapeMarkdown(ADMIN_TELEGRAM)}\n\nSend payment screenshot and your Telegram ID: \`${userId}\``, {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]] }
      });
    }

    // ─── ADMIN CALLBACKS ───
    if (data === 'admin_panel') {
      if (!isAdmin(userId)) return;
      return bot.editMessageText('🔒 *Admin Panel*\n\nChoose an action:', {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getAdminKeyboard()
      });
    }

    if (data === 'admin_stats') {
      if (!isAdmin(userId)) return;
      const stats = db.stats.get();
      const allUsers = db.users.getAll();
      return bot.editMessageText(`📊 *Admin Statistics*\n\n👥 Total Users: ${Object.keys(allUsers).length}\n📂 Total Projects: ${stats.totalProjects || 0}\n🎉 Total Reactions: ${stats.totalReactions || 0}\n\n*Text Commands:*\n/addlimit user_id amount\n/broadcast your message`, {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getAdminKeyboard()
      });
    }

    if (data === 'admin_users') {
      if (!isAdmin(userId)) return;
      const allUsers = db.users.getAll();
      let text = '👥 *Users List*\n\n';
      let count = 0;
      for (const uid in allUsers) {
        const u = allUsers[uid];
        text += `ID: \`${uid}\` \- ${escapeMarkdown(u.username || u.firstName || 'No Name')}\nLimit: ${u.dailyLimit} | Used: ${u.dailyUsed || 0}\n\n`;
        count++;
        if (count >= 20) break;
      }
      if (count === 0) text += 'No users yet.';
      return bot.editMessageText(text, {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: getAdminKeyboard()
      });
    }

    if (data === 'admin_addlimit') {
      if (!isAdmin(userId)) return;
      return bot.sendMessage(chatId, 'Send command:\n/addlimit user_id amount\n\nExample: /addlimit 123456789 500');
    }

    if (data === 'admin_broadcast') {
      if (!isAdmin(userId)) return;
      return bot.sendMessage(chatId, 'Send command:\n/broadcast Your message here');
    }

  } catch (e) {
    console.error('Callback error:', e.message);
  }
});

// ===================== MESSAGE HANDLER (STATE MACHINE + GROUP REACTS) =====================
bot.on('message', async (msg) => {
  try {
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return; // commands handled by onText

    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates[userId];

    // ─── STATE-BASED INPUTS (Private chat only) ───
    if (state && state.step !== 'idle' && msg.chat.type === 'private') {

      if (state.step === 'awaiting_link') {
        const extracted = extractChatId(text);

        if (!extracted) {
          return bot.sendMessage(chatId, '❌ Invalid format.\n\nSend like this:\n• @channelname\n• https://t.me/channelname\n• -1001234567890\n\n*Private invite links (t.me/+) are NOT supported.* Get the -100 ID instead.', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_add' }]] }
          });
        }

        if (extracted === 'PRIVATE_LINK') {
          return bot.sendMessage(chatId, '❌ *Private invite links cannot be used directly.*\n\nPlease get the channel/group ID (starts with -100) and send that.\n\n*How to get ID:* Forward any message from your channel to @userinfobot', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_add' }]] }
          });
        }

        // Check bot admin status
        const statusMsg = await bot.sendMessage(chatId, '⏳ Checking bot permissions...');
        const admin = await isBotAdmin(extracted);

        if (!admin) {
          await bot.deleteMessage(chatId, statusMsg.message_id);
          return bot.sendMessage(chatId, '⚠️ *Bot is NOT admin in this chat!*\n\nPlease add this bot as an **administrator** with ALL permissions (especially *Post Reactions*), then try again.', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_add' }]] }
          });
        }

        await bot.deleteMessage(chatId, statusMsg.message_id);
        state.data.channelId = extracted;
        state.data.channelLink = text;
        state.step = 'awaiting_emoji';

        return bot.sendMessage(chatId, '✅ *Channel/Group verified!*\n\nNow select reaction emoji:', {
          parse_mode: 'Markdown', reply_markup: getEmojiKeyboard()
        });
      }

      if (state.step === 'awaiting_count') {
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 500) {
          return bot.sendMessage(chatId, '❌ Send a number between 1 and 500.', {
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_add' }]] }
          });
        }

        state.data.count = count;
        state.step = 'awaiting_confirm';

        return bot.sendMessage(chatId, `📋 *Project Summary*\n\n🔗 Channel: ${escapeMarkdown(state.data.channelLink)}\n😊 Emoji: ${state.data.emoji}\n🔢 Max Posts: ${count}\n\n✅ Click Done to save:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '✅ Done', callback_data: 'confirm_project' }], [{ text: '❌ Cancel', callback_data: 'cancel_add' }]] }
        });
      }

      return; // handled state
    }

    // ─── GROUP AUTO-REACT ───
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
      const activeProjects = db.projects.getAllActive().filter(p => String(p.channelId) === String(chatId));
      if (activeProjects.length === 0) return;

      for (const proj of activeProjects) {
        if (proj.reactedCount >= proj.maxReacts) {
          proj.active = false;
          const projects = db.projects.getByUser(proj.userId);
          const idx = projects.findIndex(p => p.id === proj.id);
          if (idx !== -1) projects[idx] = proj;
          db.projects.set(proj.userId, projects);
          continue;
        }

        const projUser = db.users.get(proj.userId);
        if (!projUser || !projUser.verifiedAt) continue;

        const remaining = getRemainingLimit(projUser);
        if (remaining <= 0) continue;

        const success = await sendReaction(chatId, msg.message_id, proj.emoji);
        if (success) {
          deductLimit(proj.userId, 1);
          proj.reactedCount = (proj.reactedCount || 0) + 1;
          const projects = db.projects.getByUser(proj.userId);
          const idx = projects.findIndex(p => p.id === proj.id);
          if (idx !== -1) projects[idx] = proj;
          db.projects.set(proj.userId, projects);
          db.stats.update(s => ({ ...s, totalReactions: (s.totalReactions || 0) + 1 }));
        }
      }
    }

  } catch (e) {
    console.error('Message handler error:', e.message);
  }
});

// ===================== CHANNEL POST AUTO-REACT =====================
bot.on('channel_post', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;

    const activeProjects = db.projects.getAllActive().filter(p => String(p.channelId) === String(chatId));
    if (activeProjects.length === 0) return;

    for (const proj of activeProjects) {
      if (proj.reactedCount >= proj.maxReacts) {
        proj.active = false;
        const projects = db.projects.getByUser(proj.userId);
        const idx = projects.findIndex(p => p.id === proj.id);
        if (idx !== -1) projects[idx] = proj;
        db.projects.set(proj.userId, projects);
        continue;
      }

      const projUser = db.users.get(proj.userId);
      if (!projUser || !projUser.verifiedAt) continue;

      const remaining = getRemainingLimit(projUser);
      if (remaining <= 0) continue;

      const success = await sendReaction(chatId, messageId, proj.emoji);
      if (success) {
        deductLimit(proj.userId, 1);
        proj.reactedCount = (proj.reactedCount || 0) + 1;
        const projects = db.projects.getByUser(proj.userId);
        const idx = projects.findIndex(p => p.id === proj.id);
        if (idx !== -1) projects[idx] = proj;
        db.projects.set(proj.userId, projects);
        db.stats.update(s => ({ ...s, totalReactions: (s.totalReactions || 0) + 1 }));
      }
    }
  } catch (e) {
    console.error('Channel post error:', e.message);
  }
});

// ===================== ERROR HANDLERS =====================
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message || err);
});

bot.on('error', (err) => {
  console.error('Bot error:', err.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message || err);
});

console.log('🤖 Bot is running...');
