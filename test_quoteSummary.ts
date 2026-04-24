import fetch from 'node-fetch';

async function test(target: string) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${target}?modules=defaultKeyStatistics,summaryDetail`;
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  const res = await fetch(proxy);
  const json = await res.json();
  const summary = json.quoteSummary?.result?.[0]?.summaryDetail;
  console.log(target, summary?.dividendRate?.raw, summary?.dividendYield?.raw, summary?.trailingAnnualDividendRate?.raw);
}

test('0050.TW');
test('0056.TW');
test('2330.TW');
