import fetch from 'node-fetch';

async function test(target: string) {
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${target}`;
  const proxy = `https://corsproxy.io/?${encodeURIComponent(quoteUrl)}`;
  const res = await fetch(proxy);
  const json = await res.json();
  const quote = json.quoteResponse?.result?.[0];
  console.log(target, quote?.trailingAnnualDividendRate, quote?.trailingAnnualDividendYield);
}

test('0050.TW');
test('0056.TW');
test('2330.TW');
