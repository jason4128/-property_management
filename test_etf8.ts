import fetch from 'node-fetch';

async function test(target: string) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${target}?interval=1mo&range=5y&events=div`;
  const url = `https://corsproxy.io/?${encodeURIComponent(chartUrl)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  const raw = await res.text();
  console.log(raw.slice(0, 500));
}

test('0050.TW');
