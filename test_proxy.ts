import fetch from 'node-fetch';

async function test() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/0050.TW?interval=1mo&range=5y&events=div`;
  const proxies = [
    (u: string) => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(u)}`
  ];
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy(url));
      const text = await res.text();
      console.log(text.slice(0, 100));
    } catch (e: any) {
      console.log(e.message);
    }
  }
}
test();
