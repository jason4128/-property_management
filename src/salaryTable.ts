/**
 * Taiwan Civil Servant Salary Table (2024/2025 Accurate Values from NTU Personnel PDF)
 */

// 俸額表 (Basic Pay)
// Key is salaryPoint (俸點)
export const BASIC_PAY_TABLE: Record<number, number> = {
  160: 21330,
  170: 22110,
  180: 22890,
  190: 23670,
  200: 24450,
  210: 25230,
  220: 26010,
  230: 26790,
  245: 27960,
  260: 29130,
  280: 30690,
  300: 32250,
  320: 33810,
  330: 34590,
  350: 36150,
  370: 37710,
  385: 38880,
  400: 40050,
  415: 41220,
  430: 42390,
  445: 43560,
  460: 44730,
  475: 45900,
  490: 47070,
  505: 48240,
  520: 49410,
  535: 50580,
  550: 51750,
  565: 52920,
  590: 54870,
  610: 56430,
  630: 57990,
  650: 59550,
  680: 61890,
  710: 64230,
  740: 66570,
  770: 68910,
  800: 71250,
};

// 專業加給 (Professional Allowance - General Administration)
// Key is Rank (職等)
// 註：年功俸等級不影響專業加給，例如「七年功二」仍領「薦任七職等」之加給。
export const PROFESSIONAL_ALLOWANCE_TABLE: Record<string, number> = {
  '委任一職等': 19980,
  '委任二職等': 19980,
  '委任三職等': 20610,
  '委任四職等': 20610,
  '委任五職等': 21330,
  '薦任六職等': 23140,
  '薦任七職等': 24190,
  '薦任八職等': 26460,
  '薦任九職等': 28240,
  '簡任十職等': 32440,
  '簡任十一職等': 34240,
  '簡任十二職等': 36040,
  '簡任十三職等': 38040,
  '簡任十四職等': 40040,
};

// 健保投保分級表 (2026 預估分級，依用戶回饋調整)
const HEALTH_INSURANCE_GRADES = [
  27470, 27600, 28800, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 
  42000, 43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 
  66800, 72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100,
  105600, 110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 
  153300, 158700, 164100, 169500, 174900, 182000, 189500, 197000, 204500, 212000, 219500
];

const getHealthInsuranceGrade = (salary: number) => {
  for (const grade of HEALTH_INSURANCE_GRADES) {
    if (salary <= grade) return grade;
  }
  return HEALTH_INSURANCE_GRADES[HEALTH_INSURANCE_GRADES.length - 1];
};

// 保險費率與負擔比例 (2026 預估費率)
// 公保: 本俸 * 8.43% * 30% (自付)
// 健保: 投保級距 * 5.17% * 30% (自付)
// 退撫: (本俸 * 2) * 15% * 35% (自付)
// 註：政府負擔部分不計入薪資扣除額
export const calculateExpectedDeductions = (basicPay: number, professionalAllowance: number = 0) => {
  // 1. 公保 (Civil Service Insurance)
  // 基數為「本俸」，費率 8.43%，自付 30%
  // 根據用戶回饋，38460 * 0.0843 * 0.3 = 972.65 -> 972，應使用無條件捨去
  const civilServiceInsurance = Math.floor(basicPay * 0.0843 * 0.30);
  
  // 2. 退撫基金 (Pension Fund)
  // 基數為「本俸 * 2」，費率 15%，自付 35%
  const pensionFund = Math.floor(basicPay * 2 * 0.15 * 0.35);
  
  // 3. 健保 (Health Insurance)
  // 基數為「本俸 + 專業加給」，需對應投保級距，費率 5.17%，自付 30%
  const insuranceSalary = basicPay + professionalAllowance;
  const healthGrade = getHealthInsuranceGrade(insuranceSalary);
  const healthInsurance = Math.floor(healthGrade * 0.0517 * 0.30);
  
  return {
    civilServiceInsurance,
    pensionFund,
    healthInsurance
  };
};
