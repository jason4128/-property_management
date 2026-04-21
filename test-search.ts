import yahooFinance from 'yahoo-finance2';
async function test() {
  const yf = new yahooFinance();
  const result = await yf.search('統一黑馬');
  console.log("統一黑馬:", result.quotes);
  
  const result2 = await yf.search('安聯收益成長');
  console.log("安聯收益成長:", result2.quotes);

  const result3 = await yf.search('貝萊德世界科技');
  console.log("貝萊德世界科技:", result3.quotes);
}
test();
