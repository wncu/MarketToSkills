const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  let vercelPage = pages.find(p => p.url().includes('vercel.com'));
  if (!vercelPage) {
    vercelPage = await context.newPage();
  }

  console.log('Navigating Vercel tab to https://vercel.com/new...');
  await vercelPage.goto('https://vercel.com/new', { waitUntil: 'domcontentloaded' });
  await vercelPage.waitForTimeout(3000);

  console.log('Vercel New Project URL:', vercelPage.url());

  const buttons = await vercelPage.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, input')).map(e => ({
      tag: e.tagName,
      text: (e.innerText || e.textContent || '').trim().replace(/\n/g, ' '),
      href: e.href || null,
      placeholder: e.placeholder || null,
      ariaLabel: e.getAttribute('aria-label') || null
    })).filter(e => e.text || e.placeholder || e.ariaLabel);
  });

  console.log('Key elements found:', JSON.stringify(buttons.filter(b => 
    b.text.toLowerCase().includes('import') || 
    b.text.toLowerCase().includes('github') || 
    b.text.toLowerCase().includes('search') ||
    b.text.toLowerCase().includes('markettoskills') ||
    (b.placeholder && b.placeholder.toLowerCase().includes('search'))
  ), null, 2));

  process.exit(0);
}

main().catch(console.error);
