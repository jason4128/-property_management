import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore/lite';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app, 'ai-studio-a537b000-3c00-46c0-981c-7d34e6b7e53b');

const XHR_MALE_RATES = [
  [830,1210,1475,1915,2835,3205],
  [1295,1485,1780,2170,3025,3225],
  [1295,1470,1720,2090,2960,3140],
  [1280,1475,1725,2035,2855,3020],
  [1275,1475,1715,1970,2770,2920],
  [1225,1455,1665,1915,2660,2825],
  [1280,1600,1885,2140,2905,3075],
  [1535,2005,2400,2700,3515,3725],
  [2020,2805,3480,4130,5230,5515]
];
const XHR_FEMALE_RATES = [
  [820,1190,1460,1920,2830,3175],
  [1245,1415,1715,2155,2965,3145],
  [1235,1420,1675,2080,2905,3075],
  [1210,1435,1650,1970,2790,2955],
  [1130,1445,1645,1880,2650,2810],
  [1635,2335,2820,3325,4820,5115],
  [2100,3105,3940,4865,6550,6950],
  [2540,3810,4875,6180,8205,8700],
  [2945,4555,5845,7505,9840,10440]
];

const isPlanBased = (ins: any) => {
  const coverageStr = String(ins?.planCoverage || '').trim();
  return coverageStr.includes('計畫') || coverageStr.includes('計劃') || /plan/i.test(coverageStr);
};

const normalizeName = (name: string) => name ? name.toLowerCase().replace(/\s+/g, '') : '';

async function run() {
  const insurancesRef = collection(db, 'insurances');
  const snapshot = await getDocs(insurancesRef);
  for (const docSnap of snapshot.docs) {
     const id = docSnap.id;
     const ins = docSnap.data();
     const isTarget = ['XHR', 'XDC', 'RJ1', '創世紀'].some(name => ins.name?.includes(name));
     
     if (isTarget) {
        console.log('Processing:', ins.name);
        const updates: any = { planAge: 32 };
        const currentAge = 37;
        const current = { ...ins, ...updates };

        const isXHR = normalizeName(current.name).includes('xhr') || normalizeName(current.name).includes('醫療費用');
        const isPlanStyle = isPlanBased(current);

        if (isXHR) {
          const ageToUse = Number(current.planAge || currentAge || 37);
          const gender = String(current.planGender || '男性');
          const coverage = String(current.planCoverage || '計畫五');
          
          let bracketIdx = 0;
          if (ageToUse <= 4) bracketIdx = 0;
          else if (ageToUse <= 9) bracketIdx = 1;
          else if (ageToUse <= 14) bracketIdx = 2;
          else if (ageToUse <= 19) bracketIdx = 3;
          else if (ageToUse <= 24) bracketIdx = 4;
          else if (ageToUse <= 29) bracketIdx = 5;
          else if (ageToUse <= 34) bracketIdx = 6;
          else if (ageToUse <= 39) bracketIdx = 7;
          else bracketIdx = 8;

          let planIdx = 4;
          const matchPlan = coverage.match(/([一二三四五六]|\d+)/);
          if (matchPlan) {
            const numMap: Record<string, number> = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6 };
            const mVal = numMap[matchPlan[1]] || parseInt(matchPlan[1]) || 1;
            planIdx = Math.max(0, Math.min(5, mVal - 1));
          }

          const isFemale = gender.includes('女');
          const ratesTable = isFemale ? XHR_FEMALE_RATES : XHR_MALE_RATES;
          const rateBlock = ratesTable[bracketIdx] || ratesTable[7];
          const exactPremium = rateBlock[planIdx];

          updates.firstYearPremium = exactPremium;
          updates.planCalculatedPremium = `${exactPremium.toLocaleString()} 元`;

          const trend = [];
          for (let i = 0; i < 55; i++) {
            const tempAge = ageToUse + i;
            if (tempAge > 85) break;
            let tempBracket = 0;
            if (tempAge <= 4) tempBracket = 0;
            else if (tempAge <= 9) tempBracket = 1;
            else if (tempAge <= 14) tempBracket = 2;
            else if (tempAge <= 19) tempBracket = 3;
            else if (tempAge <= 24) tempBracket = 4;
            else if (tempAge <= 29) tempBracket = 5;
            else if (tempAge <= 34) tempBracket = 6;
            else if (tempAge <= 39) tempBracket = 7;
            else tempBracket = 8;
            
            const tmpRateBlock = ratesTable[tempBracket] || ratesTable[7];
            trend.push({ age: tempAge, premium: tmpRateBlock[planIdx] });
          }
          updates.premiumTrendJSON = JSON.stringify(trend);
        } else if (current.rateTableJSON && (current.planAge || currentAge) && current.planGender && current.planCoverage) {
          const rateTable = JSON.parse(current.rateTableJSON);
          const rateEntry: any = rateTable.find((r: any) => {
             const rGender = String(r.gender || '').trim().replace('性', '');
             const currGender = String(current.planGender || '').trim().replace('性', '');
             const isGenderMatch = !rGender || rGender === currGender || rGender.includes('不分') || currGender.includes('不分');
             
             const rTermStr = String(r.term || '').trim();
             const isPlanInTerm = rTermStr.includes('計畫') || rTermStr.includes('計劃');
             const currCovStr = String(current.planCoverage || '').trim();
             
             let isTermMatch = false;
             if (isPlanInTerm) {
                isTermMatch = rTermStr.replace('計畫', '計劃') === currCovStr.replace('計畫', '計劃');
             } else {
                const rTermMatch = rTermStr.match(/\d+/);
                const rTermNum = rTermMatch ? rTermMatch[0] : null;
                const currTermMatch = String(current.planTerm || '').match(/\d+/);
                const currTermNum = currTermMatch ? currTermMatch[0] : null;
                
                if (!rTermNum) {
                   isTermMatch = true;
                } else {
                   isTermMatch = rTermNum === currTermNum;
                   if (!currTermNum) isTermMatch = true; 
                }
             }

             let hasAgeMatch = false;
             const planAgeNum = Number(current.planAge || currentAge);
             if (r.rates && !Array.isArray(r.rates)) {
                const keys = Object.keys(r.rates);
                if (keys.length > 0) {
                   let minDiff = 999;
                   for (const k of keys) {
                      let diff = 999;
                      if (k.includes('-')) {
                         const [minAge, maxAge] = k.split('-').map(Number);
                         if (planAgeNum >= minAge && planAgeNum <= maxAge) diff = 0;
                         else diff = Math.min(Math.abs(planAgeNum - minAge), Math.abs(planAgeNum - maxAge));
                      } else {
                         diff = Math.abs(Number(k) - planAgeNum);
                      }
                      if (diff < minDiff) minDiff = diff;
                   }
                   hasAgeMatch = minDiff <= 10;
                }
             } else if (r.rates && Array.isArray(r.rates)) {
                if (r.rates.length > 0) {
                   const minDiff = Math.min(...r.rates.map((rt:any) => Math.abs(Number(rt.age) - Number(current.planAge || currentAge))));
                   hasAgeMatch = minDiff <= 10;
                }
             } else {
                hasAgeMatch = Math.abs(Number(r.age) - Number(current.planAge || currentAge)) <= 10;
             }
             return isGenderMatch && isTermMatch && hasAgeMatch;
          });
          
          if (rateEntry) {
            let rawRate: string | number = 0;
            const planAgeNum = Number(current.planAge || currentAge);
            if (rateEntry.rates && !Array.isArray(rateEntry.rates)) {
              const keys = Object.keys(rateEntry.rates);
              if (keys.length > 0) {
                let closestKey = keys.reduce((a: string, b: string) => {
                   let diffA = 999, diffB = 999;
                   if (a.includes('-')) {
                      const [minA, maxA] = a.split('-').map(Number);
                      diffA = (planAgeNum >= minA && planAgeNum <= maxA) ? 0 : Math.min(Math.abs(planAgeNum - minA), Math.abs(planAgeNum - maxA));
                   } else { diffA = Math.abs(Number(a) - planAgeNum); }
                   if (b.includes('-')) {
                      const [minB, maxB] = b.split('-').map(Number);
                      diffB = (planAgeNum >= minB && planAgeNum <= maxB) ? 0 : Math.min(Math.abs(planAgeNum - minB), Math.abs(planAgeNum - maxB));
                   } else { diffB = Math.abs(Number(b) - planAgeNum); }
                   return diffB < diffA ? b : a;
                });
                if (closestKey) rawRate = rateEntry.rates[closestKey];
              }
            } else if (rateEntry.rates && Array.isArray(rateEntry.rates)) {
              if (rateEntry.rates.length > 0) {
                const ageObj = rateEntry.rates.reduce((a:any, b:any) => Math.abs(Number(b.age) - Number(current.planAge || currentAge)) < Math.abs(Number(a.age) - Number(current.planAge || currentAge)) ? b : a, rateEntry.rates[0]);
                if (ageObj) rawRate = ageObj.rate || ageObj.premium || ageObj.amount || ageObj.price;
              }
            } else {
              rawRate = rateEntry.rate || rateEntry.premium || rateEntry.amount || rateEntry.price || 0;
            }

            if (typeof rawRate === 'string') rawRate = String(rawRate).replace(/,/g, '').trim();
            const rate = Number(rawRate);
            let covValue = 0;
            const covStr = String(current.planCoverage).replace(/,/g, '').trim();
            if (covStr.includes('計畫') || covStr.includes('計畫別') || covStr.includes('計劃')) {
               covValue = 1;
               const match = covStr.match(/([一二三四五六七八九十]|\d+)/);
               if (match) {
                 const numMap: Record<string, number> = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10 };
                 covValue = numMap[match[1]] || parseInt(match[1]) || 1;
               }
            } else if (covStr.includes('萬')) {
               covValue = parseFloat(covStr) * 10000;
            } else {
               covValue = parseFloat(covStr) || 0;
            }

            const isRateAlreadyPerPlan = String(rateEntry.term || '').includes('計畫') || String(rateEntry.term || '').includes('計劃');
            let premium = 0;
            const unit = current.rateUnit || '每千元';
            if (covStr.includes('計畫') || covStr.includes('計畫別') || covStr.includes('計劃')) {
               premium = isRateAlreadyPerPlan ? Math.round(rate) : Math.round(covValue * rate);
            } else if (unit.includes('每千元') || unit.includes('千元')) {
               premium = Math.round((covValue / 1000) * rate);
            } else if (unit.includes('每萬元') || unit.includes('萬元') || unit.includes('每萬')) {
               premium = Math.round((covValue / 10000) * rate);
            } else {
               premium = Math.round(covValue * rate);
            }

            if (!isNaN(premium) && premium > 0) {
               updates.firstYearPremium = premium;
               updates.planCalculatedPremium = `${premium.toLocaleString()} 元`;
               
               const termStr = String(current.planTerm || '');
               const termMatch = termStr.match(/(\d+)/);
               const terms = termMatch ? parseInt(termMatch[1]) : 1;
               if (terms > 0) {
                  const trend = [];
                  if (terms <= 1 && rateEntry.rates && !Array.isArray(rateEntry.rates)) {
                    for(let i=0; i<55; i++) {
                      const tempAge = Number(current.planAge || currentAge) + i;
                      if (tempAge > 85) break;
                      let keys = Object.keys(rateEntry.rates);
                      if (keys.length > 0) {
                        let closestKey = keys.reduce((a: string, b: string) => {
                           let diffA = 999, diffB = 999;
                           if (a.includes('-')) {
                              const [minA, maxA] = a.split('-').map(Number);
                              diffA = (tempAge >= minA && tempAge <= maxA) ? 0 : Math.min(Math.abs(tempAge - minA), Math.abs(tempAge - maxA));
                           } else { diffA = Math.abs(Number(a) - tempAge); }
                           if (b.includes('-')) {
                              const [minB, maxB] = b.split('-').map(Number);
                              diffB = (tempAge >= minB && tempAge <= maxB) ? 0 : Math.min(Math.abs(tempAge - minB), Math.abs(tempAge - maxB));
                           } else { diffB = Math.abs(Number(b) - tempAge); }
                           return diffB < diffA ? b : a;
                        });
                        let rowRate:any = rateEntry.rates[closestKey];
                        if (typeof rowRate === 'string') rowRate = String(rowRate).replace(/,/g, '');
                        const currRate = Number(rowRate);
                        let tempPrem = 0;
                        if (covStr.includes('計畫') || covStr.includes('計畫別') || covStr.includes('計劃')) {
                           const _isRateAlreadyPerPlan = String(rateEntry.term || '').includes('計畫') || String(rateEntry.term || '').includes('計劃');
                           tempPrem = _isRateAlreadyPerPlan ? Math.round(currRate) : Math.round(covValue * currRate);
                        } else if (unit.includes('每千元') || unit.includes('千元')) {
                           tempPrem = Math.round((covValue / 1000) * currRate);
                        } else if (unit.includes('每萬元') || unit.includes('萬元') || unit.includes('每萬')) {
                           tempPrem = Math.round((covValue / 10000) * currRate);
                        } else {
                           tempPrem = Math.round(covValue * currRate);
                        }
                        trend.push({ age: tempAge, premium: tempPrem });
                      }
                    }
                  } else {
                    for(let i=0; i<terms; i++) {
                       trend.push({ age: Number(current.planAge || currentAge) + i, premium: premium });
                    }
                  }
                  updates.premiumTrendJSON = JSON.stringify(trend);
               }
            }
          }
        }
        
        console.log('Writing updates for', current.name, updates.planCalculatedPremium);
        await updateDoc(doc(db, 'insurances', id), updates);
     }
  }
}
run();
