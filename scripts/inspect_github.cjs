const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('github.com'));
  if (!page) {
    console.log('No github page found');
    return;
  }
  console.log('Page URL:', page.url());
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(e => ({
      name: e.name,
      id: e.id,
      placeholder: e.placeholder,
      ariaLabel: e.getAttribute('aria-label'),
      testid: e.getAttribute('data-testid')
    }));
  });
  console.log('Inputs found:', JSON.stringify(inputs, null, 2));
}

main().catch(console.error);
