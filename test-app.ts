import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request =>
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText)
  );

  await page.goto('http://localhost:3000');
  
  // wait longer to catch the error
  await new Promise(r => setTimeout(r, 4000));
  
  const content = await page.content();
  console.log("HTML length:", content.length);
  
  await browser.close();
})();
