import yahooFinance from 'yahoo-finance2';
const yf = new yahooFinance();
yf.chart('00929.TW', { period1: '2023-01-01' }).then(data => console.log(JSON.stringify(data.events, null, 2))).catch(e => console.error(e));
