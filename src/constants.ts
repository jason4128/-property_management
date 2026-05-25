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

export const getApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // Automatically route API requests to the cloud run instance if hosted on static services like GitHub Pages
  if (
    typeof window !== 'undefined' &&
    window.location &&
    (window.location.hostname.includes('github.io') ||
     (!window.location.hostname.endsWith('.run.app') && 
      !window.location.hostname.includes('localhost') && 
      !window.location.hostname.includes('127.0.0.1')))
  ) {
    return `https://ais-pre-57a65nhc66oq2r37z3ncz5-273535694478.asia-east1.run.app${cleanPath}`;
  }
  return cleanPath;
};
