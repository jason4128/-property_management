/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SalaryRecord {
  id: string;
  date: string; // YYYY-MM
  rank: string; // 職等
  salaryPoint: number; // 俸點
  
  // Income (收)
  basicPay: number; // 本薪
  professionalAllowance: number; // 專業加給
  medicalIncentive: number; // 獎勵金-醫事及行政
  yearEndBonus: number; // 年終
  performanceBonus: number; // 考績
  overtimePay: number; // 加班費
  otherIncome: number; // 其他(收)
  retroactivePay: number; // 應追領
  
  // Deductions (支)
  civilServiceInsurance: number; // 公保費
  healthInsurance: number; // 健保費
  pensionFund: number; // 退撫離職金
  otherDeduction: number; // 其他(支)
  
  // Tax
  taxableIncome: number; // 應稅所得
  
  // Expected values for comparison
  expectedBasicPay?: number; // 應領本薪
  expectedProfessionalAllowance?: number; // 應領專業加給
  
  note?: string;
}

export interface YearlyStandard {
  id: string;
  year: string; // YYYY
  basicPay: number;
  professionalAllowance: number;
}

export interface CreditCard {
  id: string;
  name: string;
  bank: string;
  statementDate: number;
  dueDate: number;
  limit: number;
  currentBalance: number;
}

export interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  balance: number;
  type: 'savings' | 'checking' | 'fixed';
}

export interface Fund {
  id: string;
  name: string;
  cost: number;
  currentValue: number;
  units: number;
}

export interface Stock {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  source?: 'Cathay' | 'Firstrade';
}

export interface Budget {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  year: number;
}
