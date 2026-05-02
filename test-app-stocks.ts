import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:3000');
  
  await page.evaluate(() => {
    localStorage.setItem('activeTab', 'stocks');
  });
  
  await page.reload();
  await new Promise(r => setTimeout(r, 4000));
  
  const content = await page.content();
  console.log("ErrorBoundary:", content.includes('Something went wrong.'));
  console.log("HTML length:", content.length);
  
  await browser.close();
})();
