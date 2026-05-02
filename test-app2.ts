import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await new Promise(r => setTimeout(r, 4000));
  const content = await page.content();
  console.log(content.slice(0, 1000));
  console.log(content.match(/<div[^>]*>/g)?.slice(0, 50));
  
  // also check if there is an error boundary error
  console.log("ErrorBoundary?", content.includes('Something went wrong'));
  
  await browser.close();
})();
