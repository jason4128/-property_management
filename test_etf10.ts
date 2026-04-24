import https from 'https';

function fetchYahoo(target: string, range: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${target}?interval=1mo&range=${range}&events=div`,
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
    const json = await fetchYahoo(target, '2y');
    const chartData = json.chart?.result?.[0];
    const divs = chartData?.events?.dividends || {};
    console.log(target, Object.values(divs).map((d: any) => ({
      amount: d.amount,
      date: new Date(d.date * 1000).toISOString()
    })));
  } catch (e: any) {
    console.error(target, e.message);
  }
}

test('0050.TW');
test('0056.TW');
