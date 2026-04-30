import yf from 'yahoo-finance2';
async function test() {
  const data = await yf.chart('2330.TW', { period1: '2024-01-01' });
  console.log(data.quotes.slice(0, 2));
}
test();
