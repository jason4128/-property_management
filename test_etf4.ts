import fetch from 'node-fetch';

async function test(target: string) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${target}?interval=1mo&range=5y&events=div`;
  const chartProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(chartUrl)}`;
  const chartRes = await fetch(chartProxyUrl);
  const chartJson = await chartRes.json();
  const chartData = chartJson.chart?.result?.[0];
  console.log(target, Object.keys(chartData?.events?.dividends || {}).length);
}

test('0050.TW');
test('0056.TW');
test('2330.TW');
