/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const TABS = [
  { id: 'dashboard', label: '總資產概況', icon: 'LayoutDashboard' },
  { id: 'salary', label: '薪資記錄', icon: 'Wallet' },
  { id: 'credit-cards', label: '信用卡', icon: 'CreditCard' },
  { id: 'banks', label: '銀行存款', icon: 'Building2' },
  { id: 'stocks', label: '股票/基金', icon: 'BarChart3' },
  { id: 'insurance', label: '保險管理', icon: 'ShieldCheck' },
  { id: 'budget', label: '年度支出預算', icon: 'PieChart' },
  { id: 'tax', label: '所得稅管理', icon: 'FileText' },
  { id: 'retirement', label: '退休規劃', icon: 'Coffee' },
] as const;

export type TabId = typeof TABS[number]['id'] | 'wife-salary';

export const CATEGORIES = [
  '食', '衣', '住', '行', '育', '樂', '其他'
];
