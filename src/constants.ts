/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const TABS = [
  { id: 'salary', label: '薪資記錄', icon: 'Wallet' },
  { id: 'credit-cards', label: '信用卡', icon: 'CreditCard' },
  { id: 'banks', label: '各銀行', icon: 'Building2' },
  { id: 'stocks', label: '股票/基金', icon: 'BarChart3' },
  { id: 'budget', label: '年度支出預算', icon: 'PieChart' },
] as const;

export type TabId = typeof TABS[number]['id'];

export const CATEGORIES = [
  '食', '衣', '住', '行', '育', '樂', '其他'
];
