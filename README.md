# 🤖 Premium Telegram Auto-React Bot

Complete Node.js Telegram bot with **auto-reactions**, **4-step verification**, **daily limits**, **recharge system**, **admin broadcast**, and **premium UI**. No database needed - everything stored in JSON files.

---

## ✨ Features

- ✅ **4-Step Verification** (Telegram Channel, Telegram Group, YouTube, WhatsApp)
- ✅ **Auto-Reactions** to channel posts and group messages
- ✅ **Daily Limits** per user (default 200)
- ✅ **Recharge System** - Users contact admin for limit increase
- ✅ **Owner Commands** - `/addlimit` and `/broadcast`
- ✅ **Beautiful Premium UI** with inline keyboards
- ✅ **No Database** - Pure JSON file storage
- ✅ **No Webhook** - Simple polling (easy to deploy)
- ✅ **No MTProto** - Uses official Bot API only

---

## 📋 Step 1: Get Required IDs

### 1. Get BOT_TOKEN
1. Open Telegram and search **@BotFather**
2. Send `/newbot`
3. Choose a name and username for your bot
4. Copy the **HTTP API token** (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. Get Your ADMIN_ID
1. Search **@userinfobot** in Telegram
2. Start the bot
3. It will send your **Numeric ID** (e.g., `123456789`)
4. Copy this number

### 3. Get Channel/Group IDs (if private)
- For **public** channels/groups: Just use `@username`
- For **private** channels/groups:
  1. Forward any message from that channel to **@userinfobot**
  2. It will show the channel ID like `-1001234567890`
  3. Copy that ID starting with `-100`

---

## 🛠️ Step 2: Local Setup (Test on Computer)

### Install Node.js
Download from: https://nodejs.org (get LTS version, 18 or higher)

### Open Terminal/CMD and run:
```bash
# 1. Go to the bot folder
cd telegram-react-bot

# 2. Install dependencies
npm install

# 3. Edit .env file with your details
# Windows: notepad .env
# Mac/Linux: nano .env

# 4. Start the bot
npm start
```

You should see: `🤖 Bot started successfully: @YourBotName`

---

## ⚙️ Step 3: Configure .env File

Open `.env` file and fill in your details:

```
BOT_TOKEN=123456:ABC-DEF... (from BotFather)
ADMIN_ID=123456789 (your ID from userinfobot)
REQUIRED_CHANNEL=@yourchannel (channel users must join)
REQUIRED_GROUP=@yourgroup (group users must join)
YOUTUBE_LINK=https://youtube.com/@yourchannel
WHATSAPP_LINK=https://whatsapp.com/channel/yourchannel
ADMIN_WHATSAPP=+923001234567 (your WhatsApp for payments)
ADMIN_TELEGRAM=@yourusername (your Telegram username)
```

**Important:**
- The bot must be **admin** in your required channel and group
- Use `@username` for public channels, or `-100...` ID for private ones

---

## 🚀 Step 4: Deploy on Railway (Free Hosting)

Railway provides free hosting for bots. Follow these steps:

### Step 4.1: Push Code to GitHub
1. Create a new repository on https://github.com
2. Upload these files to GitHub:
   - `package.json`
   - `database.js`
   - `bot.js`
   - `Procfile`
   - `.env` (we will add this on Railway instead)
3. Do NOT upload the `data/` folder

**How to upload:**
```bash
# In your bot folder, run:
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### Step 4.2: Deploy on Railway
1. Go to https://railway.app and login with GitHub
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your bot repository
5. Click **"Add Variables"**
6. Add ALL these variables one by one:
   - `BOT_TOKEN` = your bot token
   - `ADMIN_ID` = your numeric ID
   - `REQUIRED_CHANNEL` = @yourchannel
   - `REQUIRED_GROUP` = @yourgroup
   - `YOUTUBE_LINK` = your YouTube link
   - `WHATSAPP_LINK` = your WhatsApp link
   - `ADMIN_WHATSAPP` = your WhatsApp number
   - `ADMIN_TELEGRAM` = your Telegram username
7. Click **"Deploy"**

Your bot will start automatically and run 24/7!

---

## 📱 How Users Use the Bot

### User Flow:
1. User sends `/start`
2. Bot shows **4 verification buttons**
3. User joins Telegram Channel + Group (verified by API)
4. User visits YouTube + WhatsApp (honor system with Done button)
5. User clicks **"Verify & Start Bot"**
6. After unlock, user sees main menu
7. User clicks **"Add Project"**
8. User sends channel/group link
9. Bot verifies it is admin in that channel
10. User selects emoji
11. User sends max number of posts to react to
12. User clicks Done
13. Bot auto-reacts to every new post in that channel/group!

### Important for Users:
- **Bot must be admin** in their channel/group
- Bot needs **"Post Reactions"** permission
- Each reaction costs 1 from their **daily limit**
- When limit runs out, they click **"Recharge"** to contact admin

---

## 🔒 Owner Commands

Send these commands directly to the bot (as admin):

| Command | Description |
|---------|-------------|
| `/addlimit 123456789 500` | Set user daily limit to 500 |
| `/broadcast Hello everyone!` | Send message to ALL users and channels |

---

## 🗂️ Project Structure

```
telegram-react-bot/
├── package.json       # Dependencies
├── database.js        # JSON file helpers
├── bot.js             # Main bot logic
├── Procfile           # Railway deployment file
├── .env               # Configuration (not uploaded to GitHub)
└── data/              # JSON storage (auto-created)
    ├── users.json
    ├── projects.json
    └── stats.json
```

---

## ❓ Troubleshooting

### Bot not responding?
- Check if `BOT_TOKEN` is correct in `.env`
- Check terminal for errors
- Make sure no other bot instance is running (only one polling allowed)

### Verification not working?
- Bot must be **admin** in required channel/group
- For private channels, use `-100...` ID, not invite link
- The bot needs permission to see members

### Reactions not sending?
- Bot must be **admin** in user's channel with **"Post Reactions"** permission
- Check that user has remaining daily limit
- Check terminal for error messages

### Private channels not working?
- Private invite links (`t.me/+...`) cannot be used
- Get the actual `-100...` chat ID and use that
- Forward a message to @userinfobot to get the ID

---

## 💡 Tips for Owner

1. **Daily Limit**: Every new user gets 200 reactions/day. Use `/addlimit` to increase.
2. **Admin Unlimited**: Your own projects have unlimited reactions (no daily limit).
3. **Broadcast**: `/broadcast` sends to ALL users and ALL channels where bot is admin.
4. **Data Backup**: The `data/` folder contains all JSON files. Back them up regularly.
5. **Restart**: If you change `.env`, restart the bot.

---

Made with ❤️ for the community.
