require('dotenv').config();
const { chromium } = require('playwright');
const Fisher = require('./fisher');

const config = {
  token: process.env.DISCORD_TOKEN,
  serverId: process.env.SERVER_ID,
  channelId: process.env.CHANNEL_ID,
  cooldown: parseFloat(process.env.FISH_COOLDOWN) || 3.5,
  baitType: process.env.BAIT_TYPE || 'worms',
};

let browser = null;

async function main() {
  if (!config.token || !config.serverId || !config.channelId) {
    console.error('Missing required environment variables. Check your .env file.');
    process.exit(1);
  }

  console.log('Launching browser...');
  browser = await chromium.launch({ headless: false });

  const context = await browser.newContext({
    viewport: null,
    storageState: {
      cookies: [],
      origins: [{
        origin: 'https://discord.com',
        localStorage: [{ name: 'token', value: `"${config.token}"` }]
      }]
    }
  });

  const page = await context.newPage();

  const channelUrl = `https://discord.com/channels/${config.serverId}/${config.channelId}`;
  console.log(`Navigating to channel...`);
  await page.goto(channelUrl);
  await page.waitForLoadState('networkidle');

  // Give Discord a moment to process auth
  await page.waitForTimeout(2000);

  if (page.url().includes('/login')) {
    throw new Error('Login failed - token may be invalid or expired');
  }

  console.log('Logged in successfully!');

  // Wait for chat input to be ready
  const input = page.locator('[role="textbox"]').first();
  await input.waitFor({ state: 'visible' });
  await input.click();
  console.log('Chat ready.\n');

  // Start fishing loop
  const fisher = new Fisher(page, config);
  await fisher.start();
}

async function shutdown() {
  console.log('\nShutting down...');
  if (browser) await browser.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(async (err) => {
  console.error('Error:', err.message);
  if (browser) await browser.close();
  process.exit(1);
});
