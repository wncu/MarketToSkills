const { chromium } = require('playwright');

async function main() {
  console.log('Connecting to Chrome on port 9222...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  let page = pages.find(p => p.url().includes('github.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://github.com/new', { waitUntil: 'domcontentloaded' });
  }

  console.log('Current URL:', page.url());
  if (!page.url().includes('github.com/new')) {
    await page.goto('https://github.com/new', { waitUntil: 'domcontentloaded' });
  }

  await page.waitForTimeout(1000);

  console.log('Filling repo name...');
  const repoInput = await page.waitForSelector('#repository-name-input');
  await repoInput.click();
  await repoInput.fill('MarketToSkills');
  console.log('Filled repo name: MarketToSkills');

  await page.waitForTimeout(1000);

  try {
    const descInput = await page.$('input[name="Description"]');
    if (descInput) {
      await descInput.click();
      await descInput.fill('Curated registry of 3200+ AI coding agent skills with compiled live previews, Rust Axum API and PRO Agent manifests');
      console.log('Filled description');
    }
  } catch (e) {
    console.log('Description error:', e.message);
  }

  await page.waitForTimeout(2000);

  console.log('Finding and clicking Create repository button...');
  const buttons = await page.$$eval('button', btns => btns.map(b => ({ text: b.textContent.trim(), type: b.type, disabled: b.disabled })));
  console.log('Buttons:', buttons.filter(b => b.text.includes('Create') || b.type === 'submit'));

  const submitBtn = await page.waitForSelector('button:has-text("Create repository"):not([disabled])', { timeout: 10000 });
  await submitBtn.click();

  console.log('Clicked Create repository! Waiting for navigation...');
  await page.waitForTimeout(5000);
  console.log('Final URL:', page.url());
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error in github_create_repo:', err);
  process.exit(1);
});
