# Fishing Macro QA

Browser automation tool for testing Virtual Fisher's macro detection.

## What It Does

Automates the Virtual Fisher Discord bot using a state machine:

1. **Sends `/fish` command** and waits for response
2. **Detects "out of bait"** → automatically sells inventory and buys more bait
3. **Detects text captchas** → automatically solves them using the code from the message
4. **Respects cooldowns** → waits for the configured cooldown after each fish response

### State Machine Flow

```
/fish → Response → Parse:
  - Normal catch      → /fish (after cooldown)
  - "You ran out of"  → /sell → /buy → /fish
  - Captcha (text)    → /verify <code> → continue
  - Captcha (image)   → TERMINATE (not supported)
```

## Limitations

- **Image captchas are not supported** - The program will terminate if an image captcha is detected. Text captchas (with "Code: XYZ") are solved automatically.

## Setup

1. Install dependencies:

   ```bash
   npm install
   npx playwright install chromium
   ```

2. Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

3. Get your Discord token ([instructions](https://gist.github.com/XielQs/90ab13b0c61c6888dae329199ea6aff3))

4. Get your server and channel IDs from the Discord URL:
   ```
   https://discord.com/channels/SERVER_ID/CHANNEL_ID
   ```

## Configuration

| Variable        | Description                   | Example      |
| --------------- | ----------------------------- | ------------ |
| `DISCORD_TOKEN` | Your Discord account token    |              |
| `SERVER_ID`     | Discord server ID             | `1234567890` |
| `CHANNEL_ID`    | Discord channel ID            | `1234567890` |
| `FISH_COOLDOWN` | Seconds between fish commands | `2.7`        |
| `BAIT_TYPE`     | Bait to auto-purchase         | `worms`      |

## Usage

```bash
npm start
```

Opens a browser, authenticates via token, navigates to the channel, and starts the fishing loop.

Press `Ctrl+C` to stop.
