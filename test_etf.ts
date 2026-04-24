import fetch from 'node-fetch';

async function test() {
  const target = '0050.TW';
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${target}?interval=1mo&range=2y&events=div`;
  const chartProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(chartUrl)}`;
  const chartRes = await fetch(chartProxyUrl);
  const chartJson = await chartRes.json();
  const cParsed = chartJson.contents ? JSON.parse(chartJson.contents) : chartJson;
  const chartData = cParsed.chart?.result?.[0];
  console.log(JSON.stringify(chartData?.events?.dividends, null, 2));
}

test();
