import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore/lite';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app, "ai-studio-a537b000-3c00-46c0-981c-7d34e6b7e53b");

const XHR_BENEFITS: Record<string, any> = {
  "計畫一": { ward: 500, surgery: 27500, medical: 25000, dailySelect: 280, accDevice: 2000 },
  "計畫二": { ward: 1000, surgery: 35000, medical: 50000, dailySelect: 560, accDevice: 3000 },
  "計畫三": { ward: 1500, surgery: 40000, medical: 65000, dailySelect: 840, accDevice: 4000 },
  "計畫四": { ward: 2000, surgery: 45000, medical: 70000, dailySelect: 1120, accDevice: 5000 },
  "計畫五": { ward: 3000, surgery: 55000, medical: 120000, dailySelect: 1680, accDevice: 6000 },
  "計畫六": { ward: 4000, surgery: 65000, medical: 135000, dailySelect: 2240, accDevice: 7000 }
};

const XHR_MALE_RATES: number[][] = [
  [1200, 1800, 2400, 3000, 3600, 4200], // 0-4
  [1000, 1500, 2000, 2500, 3000, 3500], // 5-9
  [800,  1200, 1600, 2000, 2400, 2800], // 10-14
  [900,  1350, 1800, 2250, 2700, 3150], // 15-19
  [1000, 1500, 2000, 2500, 3000, 3500], // 20-24
  [1100, 1650, 2200, 2750, 3300, 3850], // 25-29
  [1250, 1875, 2500, 3125, 2873, 4375], // 30-34
  [1400, 2100, 2800, 3500, 3519, 4900], // 35-39
  [1650, 2475, 3300, 4000, 4307, 5775], // 40-44
  [1950, 2925, 3900, 4875, 5850, 6825], // 45-49
  [2400, 3600, 4800, 6000, 7200, 8400], // 50-54
  [3000, 4500, 6000, 7500, 9000, 10500], // 55-59
  [3900, 5850, 7800, 9750, 11700, 13650], // 60-64
  [5100, 7650, 10200, 12750, 15300, 17850], // 65-69
  [6800, 10200, 13600, 17000, 20400, 23800], // 70-74
  [9000, 13500, 18000, 22500, 27000, 31500]  // 75-80
];

const XHR_FEMALE_RATES: number[][] = [
  [1100, 1650, 2200, 2750, 3300, 3850],
  [1000, 1500, 2000, 2500, 3000, 3500],
  [800,  1200, 1600, 2000, 2400, 2800],
  [1100, 1650, 2200, 2750, 3300, 3850],
  [1300, 1950, 2600, 3250, 3900, 4550],
  [1500, 2250, 3000, 3750, 4500, 5250],
  [1700, 2550, 3400, 4250, 5100, 5950],
  [2000, 3000, 4000, 5000, 6000, 7000],
  [2300, 3450, 4600, 5750, 6900, 8050],
  [2700, 4050, 5400, 6750, 8100, 9450],
  [3200, 4800, 6400, 8000, 9600, 11200],
  [3900, 5850, 7800, 9750, 11700, 13650],
  [4800, 7200, 9600, 12000, 14400, 16800],
  [6000, 9000, 12000, 15000, 18000, 21000],
  [8000, 12000, 16000, 20000, 24000, 28000],
  [10000, 15000, 20000, 25000, 30000, 35000]
];

async function run() {
  const insurancesRef = collection(db, 'insurances');
  const q = query(insurancesRef, where('name', '>=', '全球'));
  const snapshot = await getDocs(q);
  
  for (const document of snapshot.docs) {
    const data = document.data();
    const name = (data.name || '').toLowerCase();
    const isXHR = name.includes('xhr') || name.includes('醫療費用');
    
    if (isXHR) {
      console.log('Fixing XHR:', data.name, data.id);
      
      const currentAge = 37;
      const coverage = String(data.planCoverage || '計畫五');
      const ageToUse = 37; // the user's actual current age
      const gender = String(data.planGender || '男性');
      
      let bracketIdx = 0;
      if (ageToUse <= 4) bracketIdx = 0;
      else if (ageToUse <= 9) bracketIdx = 1;
      else if (ageToUse <= 14) bracketIdx = 2;
      else if (ageToUse <= 19) bracketIdx = 3;
      else if (ageToUse <= 24) bracketIdx = 4;
      else if (ageToUse <= 29) bracketIdx = 5;
      else if (ageToUse <= 34) bracketIdx = 6;
      else if (ageToUse <= 39) bracketIdx = 7;
      else if (ageToUse <= 44) bracketIdx = 8;
      else if (ageToUse <= 49) bracketIdx = 9;
      else if (ageToUse <= 54) bracketIdx = 10;
      else if (ageToUse <= 59) bracketIdx = 11;
      else if (ageToUse <= 64) bracketIdx = 12;
      else if (ageToUse <= 69) bracketIdx = 13;
      else if (ageToUse <= 74) bracketIdx = 14;
      else bracketIdx = 15;

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

      const planKey = ["計畫一", "計畫二", "計畫三", "計畫四", "計畫五", "計畫六"][planIdx];
      const benefits = XHR_BENEFITS[planKey] || XHR_BENEFITS["計畫五"];

      const calculatedTemplate = [
        {
          category: "醫療給付 (實支實付) (以" + planKey + "為準)",
          items: [
            {
              name: "每日病房費用限額",
              amount: benefits.ward.toLocaleString() + " 元",
              note: "入住加護或燒燙傷病房限額提高為原限額之三倍"
            },
            {
              name: "加護病房/燒燙傷病房限額",
              amount: (benefits.ward * 3).toLocaleString() + " 元",
              note: "加護病房及燒燙傷病房每日病房費用保險金限額提高為原限額之三倍"
            }
          ]
        },
        {
          category: "醫療與手術費用保險金 (以" + planKey + "為準)",
          items: [
            {
              name: "住院醫療費用保險金限額 (雜費)",
              amount: benefits.medical.toLocaleString() + " 元",
              note: "住院31-60天增為2倍，61-90天增為3倍，91-180天增為4倍，181-365天增為5倍"
            },
            {
              name: "每次手術費用保險金限額",
              amount: benefits.surgery.toLocaleString() + " 元",
              note: "每次手術最高給付金額 = 每次手術費用保險金限額 乘以 手術名稱百分率"
            },
            {
              name: "每日保險日額 (日額選擇權)",
              amount: benefits.dailySelect.toLocaleString() + " 元",
              note: "被保險人得選擇申請每日費用或申請日額保險金"
            },
            {
              name: "意外傷害輔助器裝設限額",
              amount: benefits.accDevice.toLocaleString() + " 元",
              note: "因意外傷害事故所需裝設輔助器之費用"
            }
          ]
        }
      ];

      await updateDoc(doc(db, 'insurances', document.id), {
        firstYearPremium: exactPremium,
        planCalculatedPremium: exactPremium.toLocaleString() + " 元",
        planCalculatedCoverage: JSON.stringify(calculatedTemplate)
      });
      console.log('Fixed:', document.id, exactPremium);
    }
  }
}
run();
