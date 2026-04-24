import https from 'https';

function fetchYahoo(target: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${target}?interval=1mo&range=5y&events=div`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function test(target: string) {
  try {
    const json = await fetchYahoo(target);
    const chartData = json.chart?.result?.[0];
    console.log(target, Object.keys(chartData?.events?.dividends || {}).length);
  } catch (e: any) {
    console.error(target, e.message);
  }
}

test('0050.TW');
test('0056.TW');
test('2330.TW');
test('00878.TW');
