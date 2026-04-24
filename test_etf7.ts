import fetch from 'node-fetch';

async function test(target: string) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${target}?interval=1mo&range=5y&events=div`;
  
  const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(chartUrl)}`;

  const res = await fetch(proxy);
  const raw = await res.json();
  const parsed = JSON.parse(raw.contents);
  const chartData = parsed.chart?.result?.[0];
  console.log(target, 'allorigins result:', !!chartData, 'dividends:', !!chartData?.events?.dividends);
  if (!chartData?.events?.dividends) {
     console.log(Object.keys(chartData?.events || {}));
  }
}

test('0050.TW');
test('2330.TW');
