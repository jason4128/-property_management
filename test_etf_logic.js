const dividends = {
  "1721091600": { "amount": 0.25, "date": 1721091600 },
  "1737075600": { "amount": 0.675, "date": 1737075600 },
  "1753059600": { "amount": 0.36, "date": 1753059600 },
  "1769043600": { "amount": 1, "date": 1769043600 }
};

const yearDivs = {};
Object.values(dividends).forEach((div) => {
   const date = new Date(div.date * 1000);
   const year = date.getFullYear();
   if (!yearDivs[year]) yearDivs[year] = [];
   yearDivs[year].push({ amount: div.amount, date: div.date });
});

const years = Object.keys(yearDivs).map(Number).sort((a, b) => b - a);
const maxYear = years[0];
const lastYear = maxYear - 1;

let thisYearDivs = yearDivs[maxYear] || [];
let lastYearDivs = yearDivs[lastYear] || [];

let frequencyCount = lastYearDivs.length;
let freqStr = '不定期';
if (frequencyCount >= 10) freqStr = '月配';
else if (frequencyCount >= 3) freqStr = '季配';
else if (frequencyCount == 2) freqStr = '半年配';
else if (frequencyCount == 1) freqStr = '年配';

let predictedDiv = thisYearDivs.reduce((sum, d) => sum + d.amount, 0);
if (lastYearDivs.length > 0 && thisYearDivs.length < lastYearDivs.length) {
  lastYearDivs.sort((a,b) => a.date - b.date);
  const missingCount = lastYearDivs.length - thisYearDivs.length;
  const missingFromLastYear = lastYearDivs.slice(-missingCount);
  predictedDiv += missingFromLastYear.reduce((sum, d) => sum + d.amount, 0);
}
let expectedDiv = predictedDiv;

console.log(expectedDiv, freqStr);
