const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('vercel.com/oauth/device')) || context.pages()[0];
  
  console.log('Target page URL:', page.url());
  const allowBtn = await page.waitForSelector('button:has-text("Allow Access")', { timeout: 8000 });
  if (allowBtn) {
    console.log('Clicking Allow Access button...');
    await allowBtn.click();
    await page.waitForTimeout(4000);
    console.log('Clicked Allow Access! New URL:', page.url(), 'Title:', await page.title());
  }
  process.exit(0);
}

main().catch(console.error);
