import fetch from 'node-fetch';

async function test(target: string) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${target}?interval=1mo&range=5y&events=div`;
  
  const proxies = [
    (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://cors-anywhere.herokuapp.com/${u}`
  ];

  for (let i = 0; i < proxies.length; i++) {
    try {
      const p = proxies[i];
      const res = await fetch(p(chartUrl), { headers: { 'Origin': 'http://localhost:3000' } });
      const raw = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(raw);
        if (parsed.contents) parsed = JSON.parse(parsed.contents);
      } catch (e) {
        parsed = raw;
      }
      
      const chartData = parsed.chart?.result?.[0];
      const divs = Object.keys(chartData?.events?.dividends || {}).length;
      console.log(target, `proxy ${i}`, divs);
    } catch (e: any) {
      console.log(target, `proxy ${i} FAILED`, e.message);
    }
  }
}

test('0050.TW');
