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
  [755, 1345, 1756, 2059, 3147, 3731], // 0-4
  [451, 802, 1047, 1226, 1876, 2224],  // 5-9
  [400, 714, 932, 1092, 1668, 1976],   // 10-14
  [414, 735, 959, 1125, 1719, 2038],   // 15-19
  [472, 840, 1096, 1284, 1965, 2328],  // 20-24
  [561, 1001, 1307, 1532, 2340, 2774], // 25-29
  [687, 1226, 1598, 1874, 2864, 3394], // 30-34
  [845, 1505, 1964, 2301, 3519, 4171], // 35-39
  [1038, 1848, 2413, 2828, 4324, 5126], // 40-44
  [1278, 2274, 2969, 3478, 5319, 6305], // 45-49
  [1567, 2789, 3641, 4268, 6524, 7733], // 50-54
  [1909, 3400, 4438, 5200, 7952, 9425], // 55-59
  [2249, 4005, 5227, 6127, 9366, 11102], // 60-64
  [2538, 4519, 5899, 6914, 10569, 12529], // 65-69
  [3012, 5365, 7002, 8206, 12547, 14872], // 70-74
  [3246, 5781, 7547, 8845, 13522, 16027]  // 75-80
];

const XHR_FEMALE_RATES: number[][] = [
  [674, 1200, 1567, 1835, 2805, 3326], // 0-4
  [466, 831, 1084, 1269, 1941, 2302],  // 5-9
  [607, 1081, 1413, 1655, 2531, 3000], // 10-14
  [898, 1599, 2085, 2445, 3738, 4431], // 15-19
  [1041, 1856, 2424, 2840, 4344, 5148], // 20-24
  [1119, 1991, 2598, 3045, 4654, 5518], // 25-29
  [1147, 2042, 2666, 3124, 4775, 5662], // 30-34
  [1151, 2048, 2674, 3134, 4791, 5678], // 35-39
  [1151, 2049, 2675, 3135, 4794, 5682], // 40-44
  [1171, 2086, 2721, 3189, 4876, 5780], // 45-49
  [1227, 2185, 2852, 3342, 5109, 6055], // 50-54
  [1328, 2367, 3091, 3621, 5535, 6561], // 55-59
  [1460, 2600, 3393, 3978, 6081, 7208], // 60-64
  [1927, 3433, 4480, 5251, 8028, 9516], // 65-69
  [3185, 5672, 7402, 8675, 13264, 15721], // 70-74
  [4984, 8874, 11582, 13575, 20754, 24600] // 75-80
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

      const trend = [];
      for (let i = 0; i < 30; i++) {
        const tempAge = ageToUse + i;
        if (tempAge > 80) break;
        let tempBracket = 0;
        if (tempAge <= 4) tempBracket = 0;
        else if (tempAge <= 9) tempBracket = 1;
        else if (tempAge <= 14) tempBracket = 2;
        else if (tempAge <= 19) tempBracket = 3;
        else if (tempAge <= 24) tempBracket = 4;
        else if (tempAge <= 29) tempBracket = 5;
        else if (tempAge <= 34) tempBracket = 6;
        else if (tempAge <= 39) tempBracket = 7;
        else if (tempAge <= 44) tempBracket = 8;
        else if (tempAge <= 49) tempBracket = 9;
        else if (tempAge <= 54) tempBracket = 10;
        else if (tempAge <= 59) tempBracket = 11;
        else if (tempAge <= 64) tempBracket = 12;
        else if (tempAge <= 69) tempBracket = 13;
        else if (tempAge <= 74) tempBracket = 14;
        else tempBracket = 15;

        const tempRateBlock = ratesTable[tempBracket] || ratesTable[7];
        trend.push({ age: tempAge, premium: tempRateBlock[planIdx] });
      }

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
        planCalculatedCoverage: JSON.stringify(calculatedTemplate),
        premiumTrendJSON: JSON.stringify(trend)
      });
      console.log('Fixed:', document.id, exactPremium);
    }
  }
}
run();
