# 🎯 CheapShot Discord Bot

A Discord AI assistant powered by OpenAI-compatible API endpoints. Features real-time streaming responses, multi-bot load balancing, and image generation.

**🎉 Includes a free public API** — No API key required, no rate limits!

## Features

- **Real-time Streaming**: Watch the AI response appear in real-time as it's generated
- **Request Queue**: Limits concurrent AI requests (default: 3) to prevent server overload
- **Claude Opus Model**: Uses the smartest Claude model for high-quality responses
- **Mention or DM**: Works with @mentions in servers or direct messages
- **Discord Markdown**: AI responses support Discord's markdown formatting

## Setup

### 1. Clone and Install

```bash
cd CheapShot-discord-bot
npm install
```

### 2. Configure Environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Discord Bot Token - Get from https://discord.com/developers/applications
DISCORD_TOKEN=your_discord_bot_token_here

# OpenAI-compatible API Base URL
# Free public API (no limits, no API key required):
API_BASE=https://ai-api.motoemotovps.xyz

# AI Model to use
AI_MODEL=claude-opus-4-1

# Maximum concurrent AI requests
MAX_CONCURRENT_REQUESTS=3
```

### 3. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it "CheapShot"
3. Go to the "Bot" section
4. Click "Reset Token" and copy the token to your `.env` file
5. Enable these **Privileged Gateway Intents**:
   - MESSAGE CONTENT INTENT
6. Go to "OAuth2" → "URL Generator"
7. Select scopes: `bot`
8. Select permissions: `Send Messages`, `Read Message History`, `Embed Links`
9. Copy the generated URL and open it to invite the bot to your server

### 4. Start the Bot

Then start the Discord bot:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## Usage

Once the bot is online:

- **In a server**: Mention the bot with your question: `@CheapShot What is the meaning of life?`
- **In DMs**: Just send a message directly to the bot

The bot will show a "thinking" message, then stream the response in real-time!

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Discord User   │────▶│   CheapShot     │────▶│  OpenAI-compat  │
│                 │     │   Discord Bot   │     │      API        │
│                 │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌───────────────┐
                        │  Multi-Bot    │
                        │ Load Balancer │
                        └───────────────┘
```

## License

MIT
