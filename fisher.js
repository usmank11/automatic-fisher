/**
 * Fishing automation using a state machine approach.
 * Reacts to Virtual Fisher responses to determine next action.
 */

class Fisher {
  constructor(page, config) {
    this.page = page;
    this.config = config;
    this.running = false;
    this.lastFishResponseTime = 0;
  }

  /**
   * Main loop - state machine
   */
  async start() {
    this.running = true;
    let nextAction = 'fish';

    console.log(`Starting fishing loop (cooldown: ${this.config.cooldown}s, bait: ${this.config.baitType})`);

    while (this.running) {
      try {
        // Wait for cooldown before fishing
        if (nextAction === 'fish') {
          await this.waitForCooldown();
        }

        // Execute action and wait for response
        const msgCountBefore = await this.getMessageCount();
        await this.executeAction(nextAction);
        await this.waitForMessagesSettled(msgCountBefore);

        // Give Discord time to fully render message content
        await this.wait(0.3);

        // Record response time for fish cooldown
        if (nextAction === 'fish') {
          this.lastFishResponseTime = Date.now();
        }

        // Always check for captcha first (highest priority)
        const captcha = await this.detectCaptcha();
        if (captcha) {
          await this.handleCaptcha(captcha);
        }

        // Determine next action based on response
        nextAction = await this.determineNextAction();

      } catch (err) {
        console.error('Error in fishing loop:', err.message);
        throw err;
      }
    }
  }

  /**
   * Stop the fishing loop
   */
  stop() {
    this.running = false;
    console.log('Stopping fishing loop...');
  }

  // ============================================
  // Action Execution
  // ============================================

  /**
   * Execute an action based on current state
   */
  async executeAction(action) {
    switch (action) {
      case 'fish':
        await this.sendCommand('/fish');
        break;
      case 'sell':
        await this.sendCommandWithParams('/sell', 'all');
        break;
      case 'buy':
        await this.sendCommandWithParams('/buy', `${this.config.baitType} 50`);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Determine next action based on last message content
   */
  async determineNextAction() {
    const lastMsg = await this.getLastMessage();
    const msg = lastMsg.toLowerCase();

    // Out of bait → sell first
    if (msg.includes('you ran out of')) {
      return 'sell';
    }

    // Sold inventory → buy bait
    if (msg.includes('you sold')) {
      return 'buy';
    }

    // Bought bait → fish
    if (msg.includes('you bought') || msg.includes('bait purchase')) {
      return 'fish';
    }

    // Default: fish (normal fishing response or unknown)
    return 'fish';
  }

  // ============================================
  // Captcha Handling
  // ============================================

  /**
   * Detect captcha in recent messages
   * Returns: { type: 'text', answer: 'XYZ', fullMessage: '...' } or { type: 'image', fullMessage: '...' } or null
   */
  async detectCaptcha() {
    const messages = await this.getLastMessages(2);
    const captchaMsg = messages.find(m => m.toLowerCase().includes('anti-bot'));

    if (!captchaMsg) return null;

    // Text captcha has "Code: XYZ"
    const codeMatch = captchaMsg.match(/Code:\s*(\S+)/i);
    if (codeMatch) {
      return { type: 'text', answer: codeMatch[1], fullMessage: captchaMsg };
    }

    // Otherwise it's an image captcha
    return { type: 'image', fullMessage: captchaMsg };
  }

  /**
   * Handle captcha based on type
   */
  async handleCaptcha(captcha) {
    // Log full captcha message and attachments
    console.log('\n========== CAPTCHA DETECTED ==========');
    console.log(`Type: ${captcha.type}`);
    console.log('\nFull Message Content:');
    console.log(captcha.fullMessage);
    
    // Log any attachments/images
    const attachments = await this.getCaptchaAttachments();
    if (attachments.length > 0) {
      console.log('\nAttachments:');
      attachments.forEach((att, i) => {
        console.log(`  [${i}] ${att}`);
      });
    }
    console.log('======================================\n');

    if (captcha.type === 'text') {
      console.log(`Solving text captcha: ${captcha.answer}`);
      await this.sendCommandWithParams('/verify', captcha.answer);
      await this.wait(1); // Rate limit buffer
    } else {
      throw new Error('Image captcha detected - manual intervention required. Terminating.');
    }
  }

  /**
   * Get image attachments from last captcha message
   */
  async getCaptchaAttachments() {
    const attachments = [];
    const elements = this.page.locator('[id*="message-accessories-"]').last();
    
    // Look for images within the captcha message
    const images = await elements.locator('img').all();
    for (const img of images) {
      const src = await img.getAttribute('src').catch(() => null);
      if (src) {
        attachments.push(src);
      }
    }
    
    return attachments;
  }

  // ============================================
  // Message Reading
  // ============================================

  /**
   * Get current message count
   */
  async getMessageCount() {
    const elements = this.page.locator('[id*="message-accessories-"]');
    return await elements.count();
  }

  /**
   * Get text content of last message (waits for Virtual Fisher response)
   */
  async getLastMessage() {
    const startTime = Date.now();
    const timeoutMs = 3000; // 3 second timeout

    // Busy wait for Virtual Fisher response
    while (Date.now() - startTime < timeoutMs) {
      const messages = await this.getLastMessages(1);
      const msg = messages[0] || '';
      
      // Check if this looks like a Virtual Fisher response
      const isVirtualFisherResponse = 
        msg.includes('You caught') ||       // Fishing result
        msg.includes('You sold') ||         // Sell confirmation
        msg.includes('You bought') ||       // Buy confirmation
        msg.includes('Bait purchase') ||    // Buy confirmation alt
        msg.includes('You ran out of') ||   // Out of bait
        msg.includes('Anti-bot');           // Captcha
      
      if (isVirtualFisherResponse && msg.length > 10) {
        return msg;
      }
      
      // Not Virtual Fisher response yet, wait and retry
      await this.wait(0.1);
    }
    
    // Timeout - return whatever we got (might be Discord UI or empty)
    const messages = await this.getLastMessages(1);
    return messages[0] || '';
  }

  /**
   * Get text content of last N messages
   */
  async getLastMessages(count) {
    const elements = this.page.locator('[id*="message-accessories-"]');
    const total = await elements.count();

    const messages = [];
    const start = Math.max(0, total - count);

    for (let i = start; i < total; i++) {
      const text = await elements.nth(i).textContent().catch(() => '');
      messages.push(text);
    }

    return messages;
  }

  // ============================================
  // Timing & Waiting
  // ============================================

  /**
   * Wait for messages to settle (no new messages for settleMs)
   */
  async waitForMessagesSettled(previousCount, settleMs = 300, timeoutMs = 5000) {
    const startTime = Date.now();
    let lastCount = previousCount;
    let lastChangeTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await this.wait(0.1);
      const currentCount = await this.getMessageCount();

      if (currentCount > lastCount) {
        lastCount = currentCount;
        lastChangeTime = Date.now();
      }

      if (Date.now() - lastChangeTime >= settleMs) {
        return;
      }
    }

    console.log('Warning: Timed out waiting for messages to settle');
  }

  /**
   * Wait for fish cooldown
   */
  async waitForCooldown() {
    if (this.lastFishResponseTime === 0) return;

    const elapsed = Date.now() - this.lastFishResponseTime;
    const cooldownMs = this.config.cooldown * 1000;
    const remaining = cooldownMs - elapsed;

    if (remaining > 0) {
      await this.wait(remaining / 1000);
    }
  }

  /**
   * Wait for specified seconds
   */
  async wait(seconds) {
    await this.page.waitForTimeout(seconds * 1000);
  }

  // ============================================
  // Command Sending
  // ============================================

  /**
   * Send a simple slash command (no parameters)
   */
  async sendCommand(command) {
    console.log(`> ${command}`);
    const input = this.page.locator('[role="textbox"]').first();
    await input.fill(command);
    await input.press('Enter');
    await input.press('Enter');
  }

  /**
   * Send a slash command with parameters
   */
  async sendCommandWithParams(command, params) {
    console.log(`> ${command} ${params}`);
    const input = this.page.locator('[role="textbox"]').first();
    await input.fill(command);
    await input.press('Enter');
    await input.pressSequentially(params);
    await input.press('Enter');
  }
}

module.exports = Fisher;
