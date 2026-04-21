import yahooFinance from 'yahoo-finance2';

async function run() {
  try {
    const yf = new yahooFinance();
    const data = await yf.chart('AAPL', { period1: '2020-01-01' });
    console.log("Success with chart:", data.quotes.length);
  } catch(e) {
    console.log("Error with chart:", e.message);
  }
}
run();
