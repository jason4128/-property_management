/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ReactNode } from 'react';
import { 
  Wallet, 
  CreditCard as CreditCardIcon, 
  Building2, 
  TrendingUp, 
  BarChart3, 
  PieChart,
  Plus,
  Trash2,
  RefreshCw,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Calculator,
  Camera,
  Save,
  X,
  Edit2,
  LogOut,
  LogIn,
  Settings,
  Sparkles,
  Link,
  Loader2,
  Info,
  LayoutDashboard,
  FileText,
  AlertCircle
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { TABS, TabId } from './constants';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, AreaChart, Area, BarChart, Bar, Cell as RechartsCell } from 'recharts';
import { 
  SalaryRecord, 
  CreditCard, 
  BankAccount, 
  Fund, 
  Stock, 
  Budget,
  YearlyStandard,
  TaxRecord,
  TaxStandard,
  TaxBracket
} from './types';
import { 
  BASIC_PAY_TABLE, 
  PROFESSIONAL_ALLOWANCE_TABLE, 
  calculateExpectedDeductions 
} from './salaryTable';

import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  getDocFromServer,
  getDocs
} from 'firebase/firestore';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const getAppTargetUids = (user: any) => {
  const base = ['default-user', 'local_default_user', 'guest-user', 'guest', 'anonymous', 'local_user'];
  
  // Also include the user email from metadata as a fallback if they are that user
  const emailWhitelist = ['jason2134@gmail.com'];
  
  const email = user?.email && user.email !== 'guest@example.com' ? user.email : null;
  const currentAuthEmail = auth.currentUser?.email;
  
  return Array.from(new Set([
    ...base, 
    ...emailWhitelist,
    user?.uid, 
    auth.currentUser?.uid,
    email,
    currentAuthEmail
  ])).filter(Boolean);
};

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const targetUids = auth.currentUser ? getAppTargetUids(auth.currentUser) : ['default-user', 'local_default_user'];
  const errInfo: any = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email
      })) || []
    },
    operationType,
    path,
    targetUids // Add targetUids for debugging
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Provide user feedback
  const friendlyOp = {
    [OperationType.CREATE]: '新增',
    [OperationType.UPDATE]: '更新',
    [OperationType.DELETE]: '刪除',
    [OperationType.LIST]: '讀取列表',
    [OperationType.GET]: '讀取',
    [OperationType.WRITE]: '寫入'
  }[operationType];
  
  alert(`資料庫動作失敗 (${friendlyOp}): ${errInfo.error}\n\n若持續發生，請檢查權限或登入狀態。`);
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, errorInfo: string }> {
  state = { hasError: false, errorInfo: '' };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <X size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">發生錯誤</h2>
            <p className="text-slate-600">抱歉，應用程式遇到了一些問題。</p>
            <div className="bg-slate-100 p-4 rounded-lg text-left overflow-auto max-h-40">
              <code className="text-xs text-rose-500">{this.state.errorInfo}</code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              重新整理
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Helpers ---
const toROCDate = (isoDate: string) => {
  if (!isoDate) return "";
  const [year, month] = isoDate.split('-');
  const rocYear = parseInt(year) - 1911;
  return `${rocYear}-${month}`;
};

const fromROCDate = (rocDate: string) => {
  if (!rocDate) return "";
  const [year, month] = rocDate.split('-');
  const westernYear = parseInt(year) + 1911;
  return `${westernYear}-${month}`;
};

// --- AI Service ---
const getApiKey = () => localStorage.getItem('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;

const analyzeSalaryInput = async (input: { text?: string, image?: string }) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set it in Settings.");
  }
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `你是一個專業的財務分析助手。請分析提供的公務員薪資表格（可能是文字、表格或圖片）。
  表格包含多個月份的資料，請提取每一列的資訊並以 JSON 陣列格式返回。
  
  欄位對照說明 (請嚴格對應圖片中的欄位)：
  - 年月 -> date (請轉換為 民國年-月 格式，例如 115年1月 轉換為 115-01)
  - 職等階 -> rank (例如：薦任七職等、委任五職等)
  - 俸點 -> salaryPoint (例如：505、400)
  
  特別注意職稱與俸點的對應關係 (台灣公務員制度)：
  - 「七年功二」代表「薦任七職等 年功俸二級」，對應俸點為 505。
  - 「七年功一」代表「薦任七職等 年功俸一級」，對應俸點為 490。
  - 「六年功一」代表「薦任六職等 年功俸一級」，對應俸點為 445。
  - 「九年功七」對應 710 俸點。
  - 「九年功六」對應 690 俸點。
  - 「八年功六」對應 630 俸點。
  - 「七年功六」對應 590 俸點。
  - 「六年功六」對應 520 俸點。
  - 「五年功十」對應 520 俸點。
  - 「五年功九」對應 505 俸點。
  - 「五年功八」對應 490 俸點。
  - 請根據文字脈絡推斷正確的職等名稱與俸點數字。
  - 本薪 -> basicPay
  - 專業加給 -> professionalAllowance
  - 獎勵金-醫事及行政 -> medicalIncentive
  - 年終 -> yearEndBonus
  - 考績 -> performanceBonus
  - 加班費 -> overtimePay
  - 其他 (收) -> otherIncome
  - 公保費 -> civilServiceInsurance
  - 健保費 -> healthInsurance
  - 退撫離職金 -> pensionFund
  - 其他 (支) -> otherDeduction
  - 應追領 -> retroactivePay
  - 應稅所得 -> taxableIncome

  請確保：
  1. 返回的是一個包含多個物件的陣列，對應表格中的每一行。
  2. 如果某項資訊不存在或為空白，請設為 0。
  3. 年月請使用民國年格式 (例如 115-01)。
  4. 只返回純 JSON 陣列，不要有任何解釋文字。`;

  const contents: any[] = [{ text: prompt }];
  if (input.text) contents.push({ text: `輸入內容：\n${input.text}` });
  if (input.image) {
    contents.push({
      inlineData: {
        mimeType: "image/png",
        data: input.image.split(',')[1]
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: contents },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            rank: { type: Type.STRING },
            salaryPoint: { type: Type.NUMBER },
            basicPay: { type: Type.NUMBER },
            professionalAllowance: { type: Type.NUMBER },
            medicalIncentive: { type: Type.NUMBER },
            overtimePay: { type: Type.NUMBER },
            yearEndBonus: { type: Type.NUMBER },
            performanceBonus: { type: Type.NUMBER },
            otherIncome: { type: Type.NUMBER },
            retroactivePay: { type: Type.NUMBER },
            civilServiceInsurance: { type: Type.NUMBER },
            healthInsurance: { type: Type.NUMBER },
            pensionFund: { type: Type.NUMBER },
            otherDeduction: { type: Type.NUMBER },
            taxableIncome: { type: Type.NUMBER },
          },
          required: [
            "date", "rank", "salaryPoint", "basicPay", "professionalAllowance", 
            "medicalIncentive", "overtimePay", "yearEndBonus", "performanceBonus", 
            "otherIncome", "retroactivePay", "civilServiceInsurance", "healthInsurance", 
            "pensionFund", "otherDeduction", "taxableIncome"
          ]
        }
      }
    }
  });

  const textRes = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(textRes || "[]") as Partial<SalaryRecord>[];
};

const analyzeTaxDocument = async (fileBase64: string, mimeType: string) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `你是一個專業的稅務分析助手。請分析提供的所得稅申報書或核定通知書（可能是圖片或 PDF）。
  請提取以下資訊並以 JSON 格式返回：
  - year: 稅務年度 (民國年，數字)
  - salaryUser: 本人薪資收入總額
  - salarySpouse: 配偶薪資收入總額
  - profitIncome: 營利所得 (包含股利 54C)
  - interestIncome: 利息所得
  - otherIncome: 其他所得 (如租賃、執行業務、財產交易、競技競賽及機會中獎等)
  - exemptionsCount: 免稅額人數 (本人+配偶+未滿70歲扶養親屬)
  - exemptionsSeniorCount: 70歲以上扶養親屬人數
  - isMarried: 是否有配偶 (布林值 true/false)
  - savingsDeduction: 儲蓄投資特別扣除額
  - disabilityCount: 身心障礙特別扣除人數
  - educationCount: 教育學費特別扣除人數
  - preschoolCount: 幼兒學前特別扣除人數
  - longTermCareCount: 長期照顧特別扣除人數
  - itemizedDeduction: 列舉扣除額總額 (如捐贈、保險費、醫藥費、災害損失、購屋借款利息、房屋租金支出等之合計)
  - withholding: 全部扣繳稅額
  - dividendCredits: 股利及盈餘可抵減稅額
  - note: 備註
  
  請確保：
  1. 返回純 JSON 物件。
  2. 數值均為數字類型。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: fileBase64.split(',')[1]
          }
        }
      ]
    },
    config: {
      responseMimeType: 'application/json'
    }
  });

  const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(text) as Partial<TaxRecord>;
};

const analyzeTaxStandards = async (fileBase64: string, mimeType: string) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `你是一個專業的稅務法律助手。請分析提供的台灣個人綜合所得稅年度參數文件（可能是國稅局公告圖片或新聞截圖）。
  請提取該年度的稅務參數並以 JSON 格式返回。
  
  欄位需求：
  - year: 年度 (民國年，如 112)
  - exemptionBase: 一般免稅額
  - exemptionSenior: 70歲以上免稅額
  - standardDeductionSingle: 標準扣除額 (單身)
  - standardDeductionMarried: 標準扣除額 (有配偶)
  - salaryDeductionUnit: 薪資所得特別扣除額
  - savingsDeductionLimit: 儲蓄投資特別扣除額上限 (基準 270,000)
  - disabilityDeductionUnit: 身心障礙特別扣除額
  - educationDeductionUnit: 教育學費特別扣除額
  - preschoolDeductionUnit: 幼兒學前特別扣除額
  - longTermCareDeductionUnit: 長期照顧特別扣除額
  - basicLivingExpenseUnit: 基本生活費 (如 202,000)
  - taxBrackets: 稅率級距陣列，每個物件包含：
    - limit: 該級距上限 (最後一級為 Infinity，請設為 999999999)
    - rate: 稅率 (如 0.05)
    - adjustment: 累進差額
  
  請確保：
  1. 返回純 JSON 物件。
  2. 數值均為數字類型。
  3. 級距請按金額從小到大排列。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: fileBase64.split(',')[1]
          }
        }
      ]
    },
    config: {
      responseMimeType: 'application/json'
    }
  });

  const rawText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(rawText);
  if (parsed.taxBrackets) {
    parsed.taxBrackets = parsed.taxBrackets.map((b: any) => ({
      ...b,
      limit: b.limit === 999999999 ? Infinity : b.limit
    }));
  }
  return parsed as Partial<TaxStandard>;
};

// --- Components ---

const EditableCell = ({ 
  value, 
  onSave, 
  type = "text",
  className = "" 
}: { 
  value: any, 
  onSave: (val: any) => void, 
  type?: "text" | "number",
  className?: string
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  if (isEditing) {
    return (
      <input
        autoFocus
        type={type === "number" ? "text" : type}
        inputMode={type === "number" ? "numeric" : undefined}
        className={`w-full p-1 border border-indigo-500 rounded outline-none ${className}`}
        value={type === "number" && tempValue === 0 ? "" : tempValue}
        onChange={(e) => {
          if (type === "number") {
            const val = e.target.value.replace(/[^\d]/g, '');
            setTempValue(val === "" ? 0 : Number(val));
          } else {
            setTempValue(e.target.value);
          }
        }}
        onBlur={() => {
          setIsEditing(false);
          onSave(tempValue);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setIsEditing(false);
            onSave(tempValue);
          }
          if (e.key === 'Escape') {
            setIsEditing(false);
            setTempValue(value);
          }
        }}
      />
    );
  }

  return (
    <div 
      onDoubleClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-indigo-50/50 p-1 rounded transition-colors ${className}`}
      title="雙擊以編輯"
    >
      {type === "number" ? value.toLocaleString() : value}
    </div>
  );
};

const rankToPointMap: Record<string, number> = {
  '七年功二': 505,
  '七年功一': 490,
  '六年功一': 445,
  '九年功七': 710,
  '九年功六': 690,
  '九年功五': 670,
  '八年功六': 630,
  '八年功五': 610,
  '七年功六': 590,
  '六年功六': 520,
  '五年功十': 520,
  '五年功九': 505,
  '五年功八': 490,
};

const normalizeRank = (rank: string): string => {
  if (!rank) return "";
  const r = rank.trim();
  if (r.includes('七職等') || r.includes('七年功')) return '薦任七職等';
  if (r.includes('六職等') || r.includes('六年功')) return '薦任六職等';
  if (r.includes('五職等') || r.includes('五年功')) return '委任五職等';
  if (r.includes('四職等') || r.includes('四年功')) return '委任四職等';
  if (r.includes('三職等') || r.includes('三年功')) return '委任三職等';
  if (r.includes('二職等') || r.includes('二年功')) return '委任二職等';
  if (r.includes('一職等') || r.includes('一年功')) return '委任一職等';
  if (r.includes('八職等') || r.includes('八年功')) return '薦任八職等';
  if (r.includes('九職等') || r.includes('九年功')) return '薦任九職等';
  if (r.includes('十職等') || r.includes('十年功')) return '簡任十職等';
  if (r.includes('十一職等') || r.includes('十一年功')) return '簡任十一職等';
  if (r.includes('十二職等') || r.includes('十二年功')) return '簡任十二職等';
  if (r.includes('十三職等') || r.includes('十三年功')) return '簡任十三職等';
  if (r.includes('十四職等') || r.includes('十四年功')) return '簡任十四職等';
  return r;
};

const SalaryPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string, field: keyof SalaryRecord } | null>(null);
  const [editValue, setEditValue] = useState<string | number>("");
  const [isComparing, setIsComparing] = useState(false);
  const [yearlyStandards, setYearlyStandards] = useState<YearlyStandard[]>([]);
  const [isYearlyModalOpen, setIsYearlyModalOpen] = useState(false);
  const [newYearlyStandard, setNewYearlyStandard] = useState({
    year: (new Date().getFullYear() - 1911).toString(),
    basicPay: "",
    professionalAllowance: ""
  });
  const [showYearlySuccess, setShowYearlySuccess] = useState(false);
  
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [showChart, setShowChart] = useState(false);

  const yearlyData = React.useMemo(() => {
    if (records.length === 0) return [];
    const aggregated = records.reduce((acc, r) => {
      const year = r.date.split('-')[0];
      if (!acc[year]) {
        acc[year] = {
          year,
          '實領薪資': 0,
          '固定月薪(含加給/獎勵)': 0,
          '年終/考績獎金': 0,
          '月數': 0
        };
      }
      const totalIncome = (r.basicPay || 0) + (r.professionalAllowance || 0) + (r.medicalIncentive || 0) + (r.overtimePay || 0) + (r.yearEndBonus || 0) + (r.performanceBonus || 0) + (r.otherIncome || 0);
      const totalDeduction = (r.civilServiceInsurance || 0) + (r.healthInsurance || 0) + (r.pensionFund || 0) + (r.otherDeduction || 0);
      
      acc[year]['實領薪資'] += (totalIncome - totalDeduction);
      acc[year]['固定月薪(含加給/獎勵)'] += (r.basicPay || 0) + (r.professionalAllowance || 0) + (r.medicalIncentive || 0);
      acc[year]['年終/考績獎金'] += (r.yearEndBonus || 0) + (r.performanceBonus || 0);
      acc[year]['月數'] += 1;
      return acc;
    }, {} as Record<string, any>);

    return Object.entries(aggregated)
      .sort(([yearA], [yearB]) => yearA.localeCompare(yearB))
      .map(([year, data]) => ({
        displayYear: `民國 ${Number(year) - 1911} 年`,
        year,
        '年實領總額': data['實領薪資'],
        '平均月薪(含加給)': Math.round(data['固定月薪(含加給/獎勵)'] / data['月數']),
        '年終/考績總額': data['年終/考績獎金']
      }));
  }, [records]);
  
  const [newRecord, setNewRecord] = useState<Partial<SalaryRecord>>({
    date: new Date().toISOString().slice(0, 7),
    rank: '',
    salaryPoint: 0,
    basicPay: 0,
    professionalAllowance: 0,
    medicalIncentive: 0,
    overtimePay: 0,
    yearEndBonus: 0,
    performanceBonus: 0,
    otherIncome: 0,
    retroactivePay: 0,
    civilServiceInsurance: 0,
    healthInsurance: 0,
    pensionFund: 0,
    otherDeduction: 0,
    taxableIncome: 0,
  });

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'salaryRecords'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SalaryRecord));
      setRecords(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'salaryRecords');
    });
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'yearlyStandards'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as YearlyStandard));
      setYearlyStandards(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'yearlyStandards');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleAdd = async () => {
    try {
      const record = {
        ...newRecord,
        uid: user.uid,
      };
      await addDoc(collection(db, 'salaryRecords'), record);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'salaryRecords');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeleteTarget({ type: 'salaryRecords', id, name });
  };

  const handleUpdate = async (id: string, field: keyof SalaryRecord, value: any) => {
    try {
      const updates: any = { [field]: value };
      if (field === 'rank') {
        const point = rankToPointMap[value];
        if (point) {
          updates.salaryPoint = point;
        }
      }
      await updateDoc(doc(db, 'salaryRecords', id), updates);
      setEditingCell(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'salaryRecords');
    }
  };

  const startEditing = (id: string, field: keyof SalaryRecord, value: any) => {
    setEditingCell({ id, field });
    setEditValue(value);
  };

  const calculateDifference = (record: SalaryRecord) => {
    const rocYear = toROCDate(record.date).split('-')[0];
    const standard = yearlyStandards.find(s => s.year === rocYear);
    
    // Priority: 
    // 1. Manually entered expected value on the record itself
    // 2. Yearly standard defined by the user
    // 3. Fallback to 0 if neither is set (user requested no auto-calculation)
    const expectedBasicPay = record.expectedBasicPay ?? (standard?.basicPay || 0);
    const expectedProfessionalAllowance = record.expectedProfessionalAllowance ?? (standard?.professionalAllowance || 0);
    
    // Deductions are always calculated based on the expected basic pay and professional allowance
    const expectedDeductions = calculateExpectedDeductions(expectedBasicPay, expectedProfessionalAllowance);
    
    const basicPayDiff = record.basicPay - expectedBasicPay;
    const allowanceDiff = record.professionalAllowance - expectedProfessionalAllowance;
    const insuranceDiff = record.civilServiceInsurance - expectedDeductions.civilServiceInsurance;
    const healthDiff = record.healthInsurance - expectedDeductions.healthInsurance;
    const pensionDiff = record.pensionFund - expectedDeductions.pensionFund;
    
    // Total diff = (Expected Net) - (Actual Net)
    // Positive means the user is owed money (追領)
    // Negative means the user was overpaid (追扣)
    const actualIncome = record.basicPay + record.professionalAllowance;
    const expectedIncome = expectedBasicPay + expectedProfessionalAllowance;
    const actualDeductions = record.civilServiceInsurance + record.healthInsurance + record.pensionFund;
    const expectedDeductionsTotal = expectedDeductions.civilServiceInsurance + expectedDeductions.healthInsurance + expectedDeductions.pensionFund;
    
    const totalDiff = (expectedIncome - expectedDeductionsTotal) - (actualIncome - actualDeductions);
    
    return {
      basicPayDiff,
      allowanceDiff,
      insuranceDiff,
      healthDiff,
      pensionDiff,
      totalDiff,
      expectedBasicPay,
      expectedProfessionalAllowance,
      expectedDeductions
    };
  };

  const totalOwed = records.reduce((sum, r) => {
    const diff = calculateDifference(r);
    return sum + (diff ? diff.totalDiff : 0);
  }, 0);

  const fillExpectedValues = () => {
    if (!newRecord.rank || !newRecord.salaryPoint) return;
    const normalizedRank = normalizeRank(newRecord.rank);
    const expectedBasicPay = BASIC_PAY_TABLE[newRecord.salaryPoint] || 0;
    const expectedProfessionalAllowance = PROFESSIONAL_ALLOWANCE_TABLE[normalizedRank] || 0;
    
    setNewRecord({
      ...newRecord,
      expectedBasicPay,
      expectedProfessionalAllowance,
      // We still fill actuals as a convenience, but user can change them
      basicPay: expectedBasicPay,
      professionalAllowance: expectedProfessionalAllowance,
    });
  };

  const handleAIAnalyze = async () => {
    if (!aiInput && !aiImage) return;
    setIsAnalyzing(true);
    try {
      const results = await analyzeSalaryInput({ 
        text: aiInput, 
        image: aiImage || undefined 
      });
      
      for (const res of results) {
        const record = {
          ...res,
          date: res.date ? fromROCDate(res.date) : new Date().toISOString().slice(0, 7),
          uid: user.uid,
        };
        await addDoc(collection(db, 'salaryRecords'), record);
      }
      
      setIsAIModalOpen(false);
      setAiInput("");
      setAiImage(null);
    } catch (error) {
      console.error("AI Analysis failed:", error);
      alert("AI 分析失敗，請重試或手動輸入。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddYearlyStandard = async () => {
    try {
      const standard = {
        year: newYearlyStandard.year,
        basicPay: Number(newYearlyStandard.basicPay) || 0,
        professionalAllowance: Number(newYearlyStandard.professionalAllowance) || 0,
        uid: user.uid,
      };
      await addDoc(collection(db, 'yearlyStandards'), standard);
      setNewYearlyStandard({
        year: (new Date().getFullYear() - 1911).toString(),
        basicPay: "",
        professionalAllowance: ""
      });
      setShowYearlySuccess(true);
      setTimeout(() => setShowYearlySuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'yearlyStandards');
    }
  };

  const handleDeleteYearlyStandard = async (id: string, year: string) => {
    setDeleteTarget({ type: 'yearlyStandards', id, name: `${year} 年薪資標準` });
  };

  const handleUpdateYearlyStandard = async (id: string, field: keyof YearlyStandard, value: any) => {
    try {
      await updateDoc(doc(db, 'yearlyStandards', id), { [field]: value });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'yearlyStandards');
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!isAIModalOpen) return;
      
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              setAiImage(reader.result as string);
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isAIModalOpen]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAiImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">薪資記錄</h2>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-sm font-bold text-slate-500">年份:</span>
            <select 
              className="text-sm border-none focus:ring-0 bg-transparent p-0 pr-8"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="all">全部</option>
              {Array.from(new Set(records.map(r => r.date.split('-')[0])))
                .sort((a, b) => b.localeCompare(a))
                .map(year => (
                  <option key={year} value={year}>
                    {year} (民國 {Number(year) - 1911} 年)
                  </option>
                ))
              }
            </select>
          </div>
          <button 
            onClick={() => setShowChart(!showChart)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${showChart ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            <TrendingUp size={20} /> {showChart ? '隱藏圖表' : '顯示趨勢圖'}
          </button>
          <button 
            onClick={() => setIsComparing(!isComparing)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${isComparing ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            <BarChart3 size={20} /> {isComparing ? '關閉比對' : '薪資比對模式'}
          </button>
          <button 
            onClick={() => setIsYearlyModalOpen(true)}
            className="flex items-center gap-2 bg-white text-rose-600 border border-rose-200 px-4 py-2 rounded-lg hover:bg-rose-50 transition-colors shadow-sm"
          >
            <Save size={20} /> 年度應領標準
          </button>
          <button 
            onClick={() => setIsAIModalOpen(true)}
            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors shadow-sm"
          >
            <Calculator size={20} /> AI 智慧辨識
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={20} /> 手動新增
          </button>
        </div>
      </div>

      {showChart && records.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Chart 1: Yearly Net Pay */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-5 rounded-xl shadow-sm border border-slate-200"
          >
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm">
              <TrendingUp size={16} className="text-indigo-500" />
              年實領總額趨勢
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={yearlyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="displayYear" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `${(v/10000).toFixed(0)}萬`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '年實領']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="年實領總額" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorNet)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Chart 2: Average Monthly Pay */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-5 rounded-xl shadow-sm border border-slate-200"
          >
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm">
              <TrendingUp size={16} className="text-emerald-500" />
              平均月薪成長 (含加給)
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yearlyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="displayYear" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '平均月薪']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="平均月薪(含加給)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Chart 3: Yearly Bonus Total */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-5 rounded-xl shadow-sm border border-slate-200"
          >
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm">
              <TrendingUp size={16} className="text-amber-500" />
              年終/考績獎金總額
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={yearlyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBonus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="displayYear" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `${(v/10000).toFixed(0)}萬`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '獎金總額']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="年終/考績總額" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorBonus)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>
      )}

      {isComparing && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
              <BarChart3 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-rose-800">薪資比對模式已開啟</h3>
              <p className="text-sm text-rose-600">系統將根據您設定的「年度應領薪資」或「單筆應領金額」進行比對。</p>
              <button 
                onClick={() => setIsYearlyModalOpen(true)}
                className="mt-1 text-xs font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 underline underline-offset-2"
              >
                <Save size={12} /> 設定各年度應領薪資標準 (114, 115等)
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-rose-600 font-medium">累計差額 (應追領/追扣)</p>
            <p className={`text-2xl font-black ${totalOwed > 0 ? 'text-emerald-600' : totalOwed < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              {totalOwed > 0 ? `+${totalOwed.toLocaleString()}` : totalOwed.toLocaleString()} 元
            </p>
          </div>
        </motion.div>
      )}

      {/* AI Modal */}
      <AnimatePresence>
        {isAIModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50">
                <h3 className="text-xl font-bold text-amber-800 flex items-center gap-2">
                  <Calculator className="text-amber-600" /> AI 智慧辨識
                </h3>
                <button onClick={() => setIsAIModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">貼上薪資單文字或表格內容</label>
                  <textarea 
                    className="w-full h-32 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                    placeholder="請貼上薪資單文字內容..."
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">或上傳薪資單圖片</label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {aiImage ? (
                          <img src={aiImage} alt="Preview" className="h-24 object-contain" />
                        ) : (
                          <>
                            <Plus className="w-8 h-8 mb-4 text-slate-400" />
                            <p className="mb-2 text-sm text-slate-500 font-semibold">點擊上傳、拖曳或直接貼上圖片</p>
                          </>
                        )}
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-xl text-xs text-amber-700 leading-relaxed">
                  💡 提示：您可以直接從 Excel 貼上表格，或是上傳薪資單的照片。AI 會自動嘗試辨識本俸、加給及各項扣繳金額。
                </div>
              </div>
              <div className="p-6 bg-slate-50 flex justify-end gap-3">
                <button 
                  onClick={() => setIsAIModalOpen(false)}
                  className="px-6 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  disabled={isAnalyzing || (!aiInput && !aiImage)}
                  onClick={handleAIAnalyze}
                  className="flex items-center gap-2 bg-amber-500 text-white px-8 py-2 rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
                >
                  {isAnalyzing ? (
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <Calculator size={18} />
                    </motion.div>
                  ) : <Calculator size={18} />}
                  {isAnalyzing ? "分析中..." : "開始分析"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Yearly Standards Modal */}
      <AnimatePresence>
        {isYearlyModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50">
                <h3 className="text-xl font-bold text-rose-800 flex items-center gap-2">
                  <BarChart3 className="text-rose-600" /> 設定各年度應領薪資標準
                </h3>
                <button onClick={() => setIsYearlyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100 space-y-4">
                  <h4 className="font-bold text-rose-700 text-sm">新增年度標準</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">年度 (民國年)</label>
                      <input 
                        type="text"
                        placeholder="例如：114"
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        value={newYearlyStandard.year}
                        onChange={e => setNewYearlyStandard({...newYearlyStandard, year: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">應領本薪</label>
                      <input 
                        type="text"
                        inputMode="numeric"
                        placeholder="請輸入金額"
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        value={newYearlyStandard.basicPay}
                        onChange={e => {
                          const val = e.target.value.replace(/[^\d]/g, '');
                          setNewYearlyStandard({...newYearlyStandard, basicPay: val});
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">應領專業加給</label>
                      <input 
                        type="text"
                        inputMode="numeric"
                        placeholder="請輸入金額"
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        value={newYearlyStandard.professionalAllowance}
                        onChange={e => {
                          const val = e.target.value.replace(/[^\d]/g, '');
                          setNewYearlyStandard({...newYearlyStandard, professionalAllowance: val});
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={handleAddYearlyStandard}
                      disabled={!newYearlyStandard.year}
                      className="flex-1 bg-rose-600 text-white py-2 rounded-lg font-bold hover:bg-rose-700 disabled:opacity-50 transition-all text-sm shadow-md"
                    >
                      新增年度標準
                    </button>
                    {showYearlySuccess && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border border-emerald-200"
                      >
                        <Save size={14} /> 已成功新增！
                      </motion.div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-slate-700 text-sm">已設定的年度標準</h4>
                  {yearlyStandards.length === 0 ? (
                    <p className="text-center text-slate-400 py-8 text-sm">尚無年度標準，請先新增。</p>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="p-3 text-left font-bold text-slate-600">年度</th>
                            <th className="p-3 text-right font-bold text-slate-600">應領本薪</th>
                            <th className="p-3 text-right font-bold text-slate-600">應領加給</th>
                            <th className="p-3 text-center font-bold text-slate-600">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...yearlyStandards].sort((a, b) => b.year.localeCompare(a.year)).map(s => (
                            <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-700">{s.year} 年</td>
                              <td className="p-3 text-right">
                                <EditableCell 
                                  value={s.basicPay} 
                                  type="number" 
                                  onSave={(val) => handleUpdateYearlyStandard(s.id, 'basicPay', val)} 
                                />
                              </td>
                              <td className="p-3 text-right">
                                <EditableCell 
                                  value={s.professionalAllowance} 
                                  type="number" 
                                  onSave={(val) => handleUpdateYearlyStandard(s.id, 'professionalAllowance', val)} 
                                />
                              </td>
                              <td className="p-3 text-center">
                                <button 
                                  onClick={() => handleDeleteYearlyStandard(s.id, s.year)}
                                  className="text-rose-400 hover:text-rose-600 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 flex justify-end">
                <button 
                  onClick={() => setIsYearlyModalOpen(false)}
                  className="px-8 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors"
                >
                  關閉
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isAdding && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700">
                月份 <span className="text-slate-400 font-normal text-xs">(國曆: {toROCDate(newRecord.date || "")})</span>
              </label>
              <input 
                type="month" 
                className="w-full mt-1 p-2 border rounded-md"
                value={newRecord.date}
                onChange={e => setNewRecord({...newRecord, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700">職等階</label>
              <input 
                type="text"
                list="rank-options"
                className="w-full mt-1 p-2 border rounded-md"
                placeholder="例如：七年功二"
                value={newRecord.rank}
                onChange={e => {
                  const rank = e.target.value;
                  const point = rankToPointMap[rank];
                  setNewRecord({
                    ...newRecord, 
                    rank,
                    salaryPoint: point || newRecord.salaryPoint
                  });
                }}
              />
              <datalist id="rank-options">
                {Object.keys(PROFESSIONAL_ALLOWANCE_TABLE).map(rank => (
                  <option key={rank} value={rank} />
                ))}
                {Object.keys(rankToPointMap).map(rank => (
                  <option key={rank} value={rank} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700">俸點</label>
              <select 
                className="w-full mt-1 p-2 border rounded-md"
                value={newRecord.salaryPoint}
                onChange={e => setNewRecord({...newRecord, salaryPoint: Number(e.target.value)})}
              >
                <option value="">選擇俸點</option>
                {Object.keys(BASIC_PAY_TABLE).map(point => (
                  <option key={point} value={point}>{point}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={fillExpectedValues}
                disabled={!newRecord.rank || !newRecord.salaryPoint}
                className="w-full mb-0.5 bg-slate-100 text-slate-600 px-4 py-2 rounded-md hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <Calculator size={16} /> 帶入應領標準值
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-rose-700 border-b pb-1 flex items-center gap-2">
              <BarChart3 size={18} /> 應領金額設定 (用於比對)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600">應領本薪</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="請輸入金額"
                  className="w-full mt-1 p-2 border border-rose-100 rounded-md bg-rose-50/30"
                  value={newRecord.expectedBasicPay === 0 ? "" : newRecord.expectedBasicPay}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, expectedBasicPay: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">應領專業加給</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="請輸入金額"
                  className="w-full mt-1 p-2 border border-rose-100 rounded-md bg-rose-50/30"
                  value={newRecord.expectedProfessionalAllowance === 0 ? "" : newRecord.expectedProfessionalAllowance}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, expectedProfessionalAllowance: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
            </div>
            <p className="text-[10px] text-rose-400 italic">※ 公保、健保、退撫之應扣金額將根據此處設定的「應領本薪」自動計算。</p>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-emerald-700 border-b pb-1">實際收入項目 (Actual Income)</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600">本俸</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.basicPay === 0 ? "" : newRecord.basicPay}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, basicPay: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">專業加給</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.professionalAllowance === 0 ? "" : newRecord.professionalAllowance}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, professionalAllowance: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">醫事獎勵金</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.medicalIncentive === 0 ? "" : newRecord.medicalIncentive}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, medicalIncentive: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">加班費</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.overtimePay === 0 ? "" : newRecord.overtimePay}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, overtimePay: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">年終獎金</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.yearEndBonus === 0 ? "" : newRecord.yearEndBonus}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, yearEndBonus: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">考績獎金</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.performanceBonus === 0 ? "" : newRecord.performanceBonus}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, performanceBonus: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">其他收入</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.otherIncome === 0 ? "" : newRecord.otherIncome}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, otherIncome: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">應追領</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.retroactivePay === 0 ? "" : newRecord.retroactivePay}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, retroactivePay: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-1">
              <h4 className="font-bold text-rose-700">支出項目 (Deductions)</h4>
              <button 
                onClick={() => {
                  const deductions = calculateExpectedDeductions(newRecord.basicPay || 0, newRecord.professionalAllowance || 0);
                  setNewRecord({
                    ...newRecord,
                    civilServiceInsurance: deductions.civilServiceInsurance,
                    healthInsurance: deductions.healthInsurance,
                    pensionFund: deductions.pensionFund
                  });
                }}
                className="text-xs bg-rose-50 text-rose-600 px-2 py-1 rounded border border-rose-200 hover:bg-rose-100 transition-colors"
              >
                依本薪/加給試算
              </button>
            </div>
            <div className="text-[10px] text-slate-400 mb-2">
              註：試算結果為自付部分（公保/退撫 35%，健保 30%），其餘由政府支出。
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600">公保費</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.civilServiceInsurance === 0 ? "" : newRecord.civilServiceInsurance}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, civilServiceInsurance: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">健保費</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.healthInsurance === 0 ? "" : newRecord.healthInsurance}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, healthInsurance: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">退撫金</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.pensionFund === 0 ? "" : newRecord.pensionFund}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, pensionFund: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">其他扣項</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.otherDeduction === 0 ? "" : newRecord.otherDeduction}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setNewRecord({...newRecord, otherDeduction: val === "" ? 0 : Number(val)});
                  }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-indigo-700 border-b pb-1">稅務資訊 (Tax)</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600">應稅所得</label>
                <input 
                  type="number" 
                  className="w-full mt-1 p-2 border rounded-md"
                  value={newRecord.taxableIncome}
                  onChange={e => setNewRecord({...newRecord, taxableIncome: Number(e.target.value)})}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button 
              onClick={() => setIsAdding(false)}
              className="px-6 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button 
              onClick={handleAdd}
              className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-all"
            >
              <Save size={18} /> 儲存記錄
            </button>
          </div>
        </motion.div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-3 font-bold text-slate-600 sticky left-0 bg-slate-50 z-10">年月(國曆)</th>
              <th className="p-3 font-bold text-slate-600">職等階</th>
              <th className="p-3 font-bold text-slate-600">俸點</th>
              <th className="p-3 font-bold text-slate-600 text-right">本薪</th>
              {isComparing && (
                <th className="p-3 font-bold text-rose-600 text-right bg-rose-50/50">應領本薪</th>
              )}
              <th className="p-3 font-bold text-slate-600 text-right">專業加給</th>
              {isComparing && (
                <th className="p-3 font-bold text-rose-600 text-right bg-rose-50/50">應領加給</th>
              )}
              <th className="p-3 font-bold text-slate-600 text-right">獎勵金</th>
              <th className="p-3 font-bold text-slate-600 text-right">年終/考績</th>
              <th className="p-3 font-bold text-slate-600 text-right">加班/其他</th>
              <th className="p-3 font-bold text-slate-600 text-right">公保</th>
              <th className="p-3 font-bold text-slate-600 text-right">健保</th>
              <th className="p-3 font-bold text-slate-600 text-right">退撫</th>
              <th className="p-3 font-bold text-slate-600 text-right">應追領</th>
              <th className="p-3 font-bold text-slate-600 text-right bg-emerald-50">合計(實領)</th>
              {isComparing && (
                <th className="p-3 font-bold text-rose-600 text-right bg-rose-50">比對差額</th>
              )}
              <th className="p-3 font-bold text-slate-600 text-right">應稅所得</th>
              <th className="p-3 font-bold text-slate-600 text-right">應稅(年)</th>
              <th className="p-3 font-bold text-slate-600">備註</th>
              <th className="p-3 font-bold text-slate-600 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={isComparing ? 20 : 17} className="p-8 text-center text-slate-400">尚無薪資記錄</td>
              </tr>
            ) : (
              records
                .filter(r => selectedYear === "all" || r.date.startsWith(selectedYear))
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(r => {
                const totalIncome = (r.basicPay || 0) + (r.professionalAllowance || 0) + (r.medicalIncentive || 0) + (r.overtimePay || 0) + (r.yearEndBonus || 0) + (r.performanceBonus || 0) + (r.otherIncome || 0);
                const totalDeduction = (r.civilServiceInsurance || 0) + (r.healthInsurance || 0) + (r.pensionFund || 0) + (r.otherDeduction || 0);
                const net = totalIncome - totalDeduction;
                
                const year = r.date.split('-')[0];
                const annualTaxable = records
                  .filter(item => item.date.startsWith(year))
                  .reduce((sum, item) => sum + (item.taxableIncome || 0), 0);

                const diff = calculateDifference(r);

                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors text-sm group">
                    <td className="p-3 text-slate-700 font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">{toROCDate(r.date)}</td>
                    <td className="p-3 text-slate-600">
                      <EditableCell value={r.rank} onSave={(val) => handleUpdate(r.id, 'rank', val)} />
                    </td>
                    <td className="p-3 text-slate-600">
                      <EditableCell value={r.salaryPoint} type="number" onSave={(val) => handleUpdate(r.id, 'salaryPoint', val)} />
                    </td>
                    
                    <td className="p-3 text-right text-slate-600">
                      <EditableCell 
                        value={r.basicPay} 
                        type="number" 
                        onSave={(val) => handleUpdate(r.id, 'basicPay', val)} 
                        className={isComparing && diff && diff.basicPayDiff !== 0 ? 'text-rose-600 font-bold' : ''}
                      />
                    </td>
                    {isComparing && (
                      <td className="p-3 text-right bg-rose-50/30">
                        <EditableCell 
                          value={r.expectedBasicPay || (diff?.expectedBasicPay || 0)} 
                          type="number" 
                          onSave={(val) => handleUpdate(r.id, 'expectedBasicPay', val)} 
                          className="text-rose-600 font-medium"
                        />
                      </td>
                    )}
                    <td className="p-3 text-right text-slate-600">
                      <EditableCell 
                        value={r.professionalAllowance} 
                        type="number" 
                        onSave={(val) => handleUpdate(r.id, 'professionalAllowance', val)} 
                        className={isComparing && diff && diff.allowanceDiff !== 0 ? 'text-rose-600 font-bold' : ''}
                      />
                    </td>
                    {isComparing && (
                      <td className="p-3 text-right bg-rose-50/30">
                        <EditableCell 
                          value={r.expectedProfessionalAllowance || (diff?.expectedProfessionalAllowance || 0)} 
                          type="number" 
                          onSave={(val) => handleUpdate(r.id, 'expectedProfessionalAllowance', val)} 
                          className="text-rose-600 font-medium"
                        />
                      </td>
                    )}
                    <td className="p-3 text-right text-slate-600">
                      <EditableCell value={r.medicalIncentive} type="number" onSave={(val) => handleUpdate(r.id, 'medicalIncentive', val)} />
                    </td>
                    <td className="p-3 text-right text-slate-600">
                      <div className="flex flex-col items-end">
                        <div className="flex gap-1">
                          <EditableCell value={r.yearEndBonus} type="number" onSave={(val) => handleUpdate(r.id, 'yearEndBonus', val)} />
                          <span>/</span>
                          <EditableCell value={r.performanceBonus} type="number" onSave={(val) => handleUpdate(r.id, 'performanceBonus', val)} />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right text-slate-600">
                      <div className="flex flex-col items-end">
                        <div className="flex gap-1">
                          <EditableCell value={r.overtimePay} type="number" onSave={(val) => handleUpdate(r.id, 'overtimePay', val)} />
                          <span>/</span>
                          <EditableCell value={r.otherIncome} type="number" onSave={(val) => handleUpdate(r.id, 'otherIncome', val)} />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right text-rose-500">
                      <EditableCell 
                        value={r.civilServiceInsurance} 
                        type="number" 
                        onSave={(val) => handleUpdate(r.id, 'civilServiceInsurance', val)} 
                        className={isComparing && diff && diff.insuranceDiff !== 0 ? 'font-bold underline' : ''}
                      />
                      {isComparing && diff && diff.insuranceDiff !== 0 && (
                        <div className="text-[10px] text-rose-400">預估: ${diff.expectedDeductions.civilServiceInsurance.toLocaleString()}</div>
                      )}
                    </td>
                    <td className="p-3 text-right text-rose-500">
                      <EditableCell 
                        value={r.healthInsurance} 
                        type="number" 
                        onSave={(val) => handleUpdate(r.id, 'healthInsurance', val)} 
                        className={isComparing && diff && diff.healthDiff !== 0 ? 'font-bold underline' : ''}
                      />
                      {isComparing && diff && diff.healthDiff !== 0 && (
                        <div className="text-[10px] text-rose-400">預估: ${diff.expectedDeductions.healthInsurance.toLocaleString()}</div>
                      )}
                    </td>
                    <td className="p-3 text-right text-rose-500">
                      <EditableCell 
                        value={r.pensionFund} 
                        type="number" 
                        onSave={(val) => handleUpdate(r.id, 'pensionFund', val)} 
                        className={isComparing && diff && diff.pensionDiff !== 0 ? 'font-bold underline' : ''}
                      />
                      {isComparing && diff && diff.pensionDiff !== 0 && (
                        <div className="text-[10px] text-rose-400">預估: ${diff.expectedDeductions.pensionFund.toLocaleString()}</div>
                      )}
                    </td>
                    <td className="p-3 text-right text-amber-600">
                      <EditableCell value={r.retroactivePay} type="number" onSave={(val) => handleUpdate(r.id, 'retroactivePay', val)} />
                    </td>
                    <td className="p-3 text-right text-emerald-600 font-bold bg-emerald-50/30">${net.toLocaleString()}</td>
                    
                    {isComparing && (
                      <td className={`p-3 text-right font-bold bg-rose-50 ${diff && diff.totalDiff > 0 ? 'text-emerald-600' : diff && diff.totalDiff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {diff ? (diff.totalDiff > 0 ? `+${diff.totalDiff.toLocaleString()}` : diff.totalDiff.toLocaleString()) : '-'}
                      </td>
                    )}

                    <td className="p-3 text-right text-indigo-600 font-medium">
                      <EditableCell value={r.taxableIncome} type="number" onSave={(val) => handleUpdate(r.id, 'taxableIncome', val)} />
                    </td>
                    <td className="p-3 text-right text-slate-400 text-xs">${annualTaxable.toLocaleString()}</td>
                    <td className="p-3 text-slate-500 italic text-xs">
                      <EditableCell value={r.note || ""} onSave={(val) => handleUpdate(r.id, 'note', val)} className="min-w-[100px]" />
                    </td>
                    <td className="p-3 text-center">
                      <button 
                        onClick={() => handleDelete(r.id, r.date)}
                        className="text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CreditCardPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newCard, setNewCard] = useState<Partial<CreditCard>>({
    name: '', bank: '', statementDate: 1, dueDate: 1, limit: 0, currentBalance: 0
  });

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'creditCards'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CreditCard));
      setCards(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'creditCards');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleAdd = async () => {
    try {
      const card = { ...newCard, uid: user.uid };
      await addDoc(collection(db, 'creditCards'), card);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'creditCards');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeleteTarget({ type: 'creditCards', id, name });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">信用卡管理</h2>
        <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={20} /> 新增卡片
        </button>
      </div>

      {isAdding && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="卡片名稱" className="p-2 border rounded-md" value={newCard.name} onChange={e => setNewCard({...newCard, name: e.target.value})} />
            <input type="text" placeholder="銀行" className="p-2 border rounded-md" value={newCard.bank} onChange={e => setNewCard({...newCard, bank: e.target.value})} />
            <input type="number" placeholder="額度" className="p-2 border rounded-md" value={newCard.limit} onChange={e => setNewCard({...newCard, limit: Number(e.target.value)})} />
            <input type="number" placeholder="目前未出帳金額" className="p-2 border rounded-md" value={newCard.currentBalance} onChange={e => setNewCard({...newCard, currentBalance: Number(e.target.value)})} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
            <button onClick={handleAdd} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">儲存</button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(card => (
          <div key={card.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative group">
            <button onClick={() => handleDelete(card.id, card.name)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={18} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                <CreditCardIcon size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{card.name}</h3>
                <p className="text-xs text-slate-500">{card.bank}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">目前餘額</span>
                <span className="font-semibold text-slate-800">${card.currentBalance.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full" 
                  style={{ width: `${Math.min((card.currentBalance / card.limit) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>額度: ${card.limit.toLocaleString()}</span>
                <span>{Math.round((card.currentBalance / card.limit) * 100)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BankPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<Partial<BankAccount>>({
    name: '', bankName: '', balance: 0, type: 'savings', interestRate: 0, balanceLimit: 0, remark: ''
  });
  const [editingAccount, setEditingAccount] = useState<Partial<BankAccount>>({});

  // AI Scraper state
  const [aiAnalysisUrl, setAiAnalysisUrl] = useState('');
  const [aiAnalysisText, setAiAnalysisText] = useState('');
  const [aiMode, setAiMode] = useState<'url' | 'text'>('url');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [targetForAi, setTargetForAi] = useState<'new' | 'edit'>('new');

  // 利率計算器暫存
  const [calcInterest, setCalcInterest] = useState({ amount: 0, months: 12 });

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'bankAccounts'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BankAccount));
      setAccounts(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bankAccounts');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleAdd = async () => {
    try {
      const account = { ...newAccount, uid: user.uid };
      await addDoc(collection(db, 'bankAccounts'), account);
      setIsAdding(false);
      setNewAccount({ name: '', bankName: '', balance: 0, type: 'savings', interestRate: 0, balanceLimit: 0, remark: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bankAccounts');
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updateDoc(doc(db, 'bankAccounts', editingId), editingAccount);
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'bankAccounts');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeleteTarget({ type: 'bankAccounts', id, name });
  };

  const startEditing = (acc: BankAccount) => {
    setEditingId(acc.id);
    setEditingAccount(acc);
    setCalcInterest({ amount: 0, months: 12 });
  };

  const syncInterestRate = (type: 'new' | 'edit') => {
    const target = type === 'new' ? newAccount : editingAccount;
    const balance = target.balance || 0;
    if (balance === 0 || calcInterest.amount === 0) return;
    const rate = (calcInterest.amount / balance) * (12 / calcInterest.months) * 100;
    const roundedRate = Math.round(rate * 1000) / 1000;
    if (type === 'new') setNewAccount({...newAccount, interestRate: roundedRate});
    else setEditingAccount({...editingAccount, interestRate: roundedRate});
  };

  const analyzeUrlWithAi = async () => {
    if (aiMode === 'url' && !aiAnalysisUrl) return;
    if (aiMode === 'text' && !aiAnalysisText) return;

    // Use the system-provided key as primary, fallback to localStorage if explicitly managed
    const apiKey = process.env.GEMINI_API_KEY || localStorage.getItem('GEMINI_API_KEY');
    
    if (!apiKey) {
      alert("GEMINI_API_KEY is not configured.");
      return;
    }
    
    setIsAnalyzing(true);
    try {
      let text = aiAnalysisText;

      if (aiMode === 'url') {
        const scrapeResp = await fetch('/api/scrape-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: aiAnalysisUrl })
        });
        const scrapeData = await scrapeResp.json();
        if (scrapeData.error) {
          throw new Error(scrapeData.error || "網頁讀取超時或失敗");
        }
        text = scrapeData.text;
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `你是一個專業的金融活動分析師。請分析以下網頁文字內容，提取有關「數位帳戶/高利活存」的優惠資訊：
1. 年度利率 (%) (請提取純數字)
2. 加碼活動條件及限制 (請簡潔總結)
3. 存款上限 (如果有提到，純數字)

網頁內容：
${text}

請嚴格按照以下 JSON 格式回覆：
{
  "rate": number,
  "conditions": "string",
  "limit": number | null
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rate: { type: Type.NUMBER },
              conditions: { type: Type.STRING },
              limit: { type: Type.NUMBER, nullable: true }
            },
            required: ["rate", "conditions"]
          }
        }
      });
      
      const responseText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(responseText || '{}');
      
      if (targetForAi === 'new') {
        setNewAccount({
          ...newAccount, 
          interestRate: result.rate || newAccount.interestRate,
          balanceLimit: result.limit || newAccount.balanceLimit,
          remark: result.conditions || newAccount.remark
        });
      } else {
        setEditingAccount({
          ...editingAccount,
          interestRate: result.rate || editingAccount.interestRate,
          balanceLimit: result.limit || editingAccount.balanceLimit,
          remark: result.conditions || editingAccount.remark
        });
      }
      setShowAiModal(false);
      setAiAnalysisUrl('');
      setAiAnalysisText('');
    } catch (error: any) {
      console.error("AI Analysis failed:", error);
      alert(`AI 分析失敗：${error.message || "請確認網址是否可存取，或嘗試使用「文字貼上」模式。"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderNumberInput = (
    label: string, 
    value: number | undefined, 
    onChange: (val: number) => void,
    step?: string
  ) => (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase">{label}</label>
      <input 
        type="number" 
        step={step}
        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
        value={(value === undefined || value === 0) ? '' : value} 
        placeholder="0"
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} 
      />
    </div>
  );

  const categories = [
    { title: '一般銀行存款', types: ['savings', 'checking', 'fixed'], data: accounts.filter(a => ['savings', 'checking', 'fixed', undefined].includes(a.type)) },
    { title: '高利活存', types: ['high-yield'], data: accounts.filter(a => a.type === 'high-yield') },
    { title: '貸款 / 借貸', types: ['loan'], data: accounts.filter(a => a.type === 'loan') }
  ];

  const totalBalance = accounts.reduce((sum, a) => sum + (a.type === 'loan' ? -a.balance : a.balance), 0);
  const totalLoan = accounts.filter(a => a.type === 'loan').reduce((sum, a) => sum + (a.balance || 0), 0);

  const totalInterest = accounts.reduce((sum, acc) => {
    if (acc.interestRate && acc.balance > 0 && acc.type !== 'loan') {
      return sum + (acc.balance * (acc.interestRate / 100));
    }
    return sum;
  }, 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">銀行存款</h2>
          <p className="text-sm text-slate-500">管理您的銀行存款、高利活存以及貸款還款進度</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Calculator size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">預估年利息</p>
              <p className="text-lg font-black text-indigo-600">${Math.round(totalInterest).toLocaleString()}</p>
            </div>
          </div>
          {!isAdding && (
            <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 font-bold">
              <Plus size={20} /> 新增項目
            </button>
          )}
        </div>
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">存款總額 (不含高利)</p>
          <p className="text-2xl font-black text-slate-800">${accounts.filter(a => ['savings', 'checking', 'fixed', undefined].includes(a.type)).reduce((sum, a) => sum + a.balance, 0).toLocaleString()}</p>
        </div>
        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">高利活存總額</p>
          <p className="text-2xl font-black text-indigo-700">${accounts.filter(a => a.type === 'high-yield').reduce((sum, a) => sum + a.balance, 0).toLocaleString()}</p>
        </div>
        <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
          <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-1">剩餘貸款總額</p>
          <p className="text-2xl font-black text-rose-700">${totalLoan.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-indigo-200 flex justify-between items-center bg-indigo-50/20 shadow-sm">
        <span className="font-bold text-secondary text-slate-600">資產淨值 (存款 - 貸款)</span>
        <span className={`text-2xl font-black ${totalBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          ${totalBalance.toLocaleString()}
        </span>
      </div>

      {isAdding && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-2xl shadow-lg border border-indigo-100 space-y-4 ring-2 ring-indigo-50">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="font-bold text-indigo-900">新增存款項目或貸款</h3>
            <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">項目名稱</label>
              <input type="text" placeholder="例如：薪轉戶、房貸" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={newAccount.name || ''} onChange={e => setNewAccount({...newAccount, name: e.target.value})} />
            </div>
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">銀行存款</label>
              <input type="text" placeholder="台銀、國泰" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={newAccount.bankName || ''} onChange={e => setNewAccount({...newAccount, bankName: e.target.value})} />
            </div>
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">類型</label>
              <select className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={newAccount.type || 'savings'} onChange={e => setNewAccount({...newAccount, type: e.target.value as any})}>
                <option value="savings">一般活存</option>
                <option value="high-yield">✨ 高利活存</option>
                <option value="checking">支票帳戶</option>
                <option value="fixed">定期存款</option>
                <option value="loan">貸款 / 借貸</option>
              </select>
            </div>
            {renderNumberInput(newAccount.type === 'loan' ? '剩餘貸款' : '目前餘額', newAccount.balance, val => setNewAccount({...newAccount, balance: val}))}

            {(newAccount.type === 'high-yield' || newAccount.type === 'loan' || newAccount.type === 'fixed' || newAccount.type === 'savings') && (
              <div className="md:col-span-4 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">利率與條件設定</span>
                    {newAccount.type === 'high-yield' && (
                      <button onClick={() => { setTargetForAi('new'); setShowAiModal(true); }} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-bold hover:bg-indigo-700 transition-all shadow-md">
                        <Sparkles size={12} /> AI 辨識活動網址
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {renderNumberInput('年度利率 (%)', newAccount.interestRate, val => setNewAccount({...newAccount, interestRate: val}), "0.001")}
                  {newAccount.type === 'high-yield' && renderNumberInput('優惠存款上限', newAccount.balanceLimit, val => setNewAccount({...newAccount, balanceLimit: val}))}
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">加碼活動條件 / 備註</label>
                    <input type="text" placeholder="例如：需每月轉入2萬、限新戶" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={newAccount.remark || ''} onChange={e => setNewAccount({...newAccount, remark: e.target.value})} />
                  </div>
                </div>
              </div>
            )}
            {newAccount.type === 'loan' && (
              <div className="md:col-span-1">
                {renderNumberInput('每期還款金額', newAccount.monthlyPayment, val => setNewAccount({...newAccount, monthlyPayment: val}))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-500 font-medium hover:text-slate-700">取消</button>
            <button onClick={handleAdd} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-bold shadow-md transition-all active:scale-95">確認儲存</button>
          </div>
        </motion.div>
      )}

      {categories.map((cat, catIdx) => (
        <div key={catIdx} className="space-y-4">
          <div className="flex items-center gap-4 px-2">
            <h3 className="font-black text-slate-400 uppercase tracking-[0.2em] text-xs">{cat.title}</h3>
            <div className="h-px bg-slate-200 flex-1"></div>
            <span className="text-xs font-bold text-slate-400">小計: ${cat.data.reduce((sum, a) => sum + (a.balance || 0), 0).toLocaleString()}</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50/50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[25%]">項目名稱</th>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">金額</th>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">利率 / 利息</th>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">備註 / 條件</th>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cat.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-300 italic text-sm">此分類暫無資料</td>
                  </tr>
                )}
                {cat.data.map(acc => {
                  const isEditing = editingId === acc.id;
                  const editingType = editingAccount.type || acc.type;
                  const isHighYield = editingType === 'high-yield';
                  const annualInterest = (acc.balance * (acc.interestRate || 0)) / 100;
                  const limitPercent = acc.balanceLimit ? Math.min((acc.balance / acc.balanceLimit) * 100, 100) : 0;

                  if (isEditing) {
                    return (
                      <tr key={acc.id} className="bg-indigo-50/30">
                        <td className="p-4">
                          <input className="w-full p-2 border rounded-md mb-1 focus:ring-2 focus:ring-indigo-500 outline-none" type="text" value={editingAccount.name || ''} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})} />
                          <input className="w-full p-1 text-xs border rounded-md mb-1 focus:ring-2 focus:ring-indigo-500 outline-none" type="text" value={editingAccount.bankName || ''} onChange={e => setEditingAccount({...editingAccount, bankName: e.target.value})} />
                          <select className="w-full p-1 text-[10px] border rounded-md focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-500 bg-slate-50" value={editingAccount.type || 'savings'} onChange={e => setEditingAccount({...editingAccount, type: e.target.value as any})}>
                            <option value="savings">一般活存</option>
                            <option value="high-yield">✨ 高利活存</option>
                            <option value="checking">支票帳戶</option>
                            <option value="fixed">定期存款</option>
                            <option value="loan">貸款 / 借貸</option>
                          </select>
                        </td>
                        <td className="p-4 text-right">
                          <input className="p-2 border rounded-md w-full text-right font-black focus:ring-2 focus:ring-indigo-500 outline-none" type="number" value={editingAccount.balance ?? 0} onChange={e => setEditingAccount({...editingAccount, balance: Number(e.target.value)})} />
                          {isHighYield && (
                            <div className="mt-2 text-right">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">存款上限</label>
                              <input className="p-1 text-[10px] border rounded w-full text-right focus:ring-2 focus:ring-indigo-500 outline-none" type="number" value={editingAccount.balanceLimit ?? 0} onChange={e => setEditingAccount({...editingAccount, balanceLimit: Number(e.target.value)})} />
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2 mb-2">
                            <input className="p-1 border rounded w-16 text-right font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" type="number" step="0.001" value={editingAccount.interestRate ?? 0} onChange={e => setEditingAccount({...editingAccount, interestRate: Number(e.target.value)})} /> %
                          </div>
                          {isHighYield && (
                            <button onClick={() => { setTargetForAi('edit'); setShowAiModal(true); }} className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 justify-end ml-auto hover:underline">
                              <Sparkles size={10} /> AI 重新辨識
                            </button>
                          )}
                        </td>
                        <td className="p-4">
                          <textarea className="w-full p-2 border rounded-md text-xs h-20 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={editingAccount.remark || ''} onChange={e => setEditingAccount({...editingAccount, remark: e.target.value})} placeholder="加碼條件或備註" />
                        </td>
                        <td className="p-4 text-center space-y-2">
                          <button onClick={handleUpdate} className="p-2 bg-indigo-600 text-white rounded-lg block mx-auto hover:bg-indigo-700 shadow-md">
                            <Save size={16} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 block mx-auto hover:text-slate-600">
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={acc.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${catIdx === 1 ? 'bg-indigo-100 text-indigo-600' : catIdx === 2 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                            {catIdx === 2 ? <TrendingUp className="rotate-180" size={18} /> : <Building2 size={18} />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{acc.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{acc.bankName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <p className={`text-lg font-black ${catIdx === 2 ? 'text-rose-600' : 'text-slate-800'}`}>${(acc.balance || 0).toLocaleString()}</p>
                        {isHighYield && acc.balanceLimit && (
                          <div className="mt-1 w-32 ml-auto">
                            <div className="flex justify-between text-[9px] mb-1 font-bold text-slate-400">
                              <span>進度: {limitPercent.toFixed(0)}%</span>
                              <span>限額: {(acc.balanceLimit / 10000).toLocaleString()}萬</span>
                            </div>
                            <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-500 ${limitPercent >= 100 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${limitPercent}%` }}></div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {acc.interestRate ? (
                          <div className="space-y-0.5">
                            <p className="font-bold text-indigo-600">{acc.interestRate}%</p>
                            <p className="text-[10px] text-slate-400 font-bold tracking-tight">預估年{catIdx === 2 ? '利息' : '收益'}: ${annualInterest.toFixed(0).toLocaleString()}</p>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-4">
                        {acc.remark ? (
                          <div className="flex gap-1.5 items-start">
                            <Info size={12} className="text-slate-300 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-slate-500 leading-relaxed font-medium line-clamp-3">{acc.remark}</p>
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-300 italic font-medium">尚無備註</p>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEditing(acc)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-slate-100 transition-all">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(acc.id, acc.name)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-slate-100 transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* AI Modal with Fallback */}
      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">AI 活動自動辨識</h3>
                <p className="text-sm text-slate-500">自動辨識利率與條件</p>
              </div>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button 
                onClick={() => setAiMode('url')} 
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${aiMode === 'url' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                網址讀取
              </button>
              <button 
                onClick={() => setAiMode('text')} 
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${aiMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                文字貼上
              </button>
            </div>
            
            <div className="space-y-4">
              {aiMode === 'url' ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">網頁連結 (URL)</label>
                  <div className="relative">
                    <Link size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="url" 
                      placeholder="https://www.bank.com.tw/..." 
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-medium" 
                      value={aiAnalysisUrl}
                      onChange={e => setAiAnalysisUrl(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">活動內容文字</label>
                  <textarea 
                    placeholder="請貼上活動網頁的文字內容..." 
                    className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-medium h-40 resize-none" 
                    value={aiAnalysisText}
                    onChange={e => setAiAnalysisText(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowAiModal(false)} 
                  disabled={isAnalyzing}
                  className="flex-1 px-4 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all disabled:opacity-50"
                >
                  取消
                </button>
                <button 
                  onClick={analyzeUrlWithAi}
                  disabled={isAnalyzing || (aiMode === 'url' ? !aiAnalysisUrl : !aiAnalysisText)}
                  className="flex-[2] px-4 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                  {isAnalyzing ? 'AI 分析中...' : '開始分析'}
                </button>
              </div>
            </div>
            
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
              <Info size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                提示：若網址讀取失敗（超時或防火牆阻擋），請切換「文字貼上」模式，將網頁內容複製後貼上即可。
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const FundPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newFund, setNewFund] = useState<Partial<Fund>>({ name: '', cost: 0, currentValue: 0, units: 0 });

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'funds'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Fund));
      setFunds(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'funds');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleAdd = async () => {
    try {
      const fund = { ...newFund, uid: user.uid };
      await addDoc(collection(db, 'funds'), fund);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'funds');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'funds', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'funds');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">基金投資</h2>
        <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={20} /> 新增基金
        </button>
      </div>

      {isAdding && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="基金名稱" className="p-2 border rounded-md" value={newFund.name} onChange={e => setNewFund({...newFund, name: e.target.value})} />
            <input type="number" placeholder="持有單位數" className="p-2 border rounded-md" value={newFund.units} onChange={e => setNewFund({...newFund, units: Number(e.target.value)})} />
            <input type="number" placeholder="投資成本" className="p-2 border rounded-md" value={newFund.cost} onChange={e => setNewFund({...newFund, cost: Number(e.target.value)})} />
            <input type="number" placeholder="目前市值" className="p-2 border rounded-md" value={newFund.currentValue} onChange={e => setNewFund({...newFund, currentValue: Number(e.target.value)})} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
            <button onClick={handleAdd} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">儲存</button>
          </div>
        </motion.div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 text-slate-600">基金名稱</th>
              <th className="p-4 text-slate-600 text-right">投資成本</th>
              <th className="p-4 text-slate-600 text-right">目前市值</th>
              <th className="p-4 text-slate-600 text-right">損益</th>
              <th className="p-4 text-slate-600 text-right">報酬率</th>
              <th className="p-4 text-slate-600 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {funds.map(fund => {
              const profit = fund.currentValue - fund.cost;
              const roi = (profit / fund.cost) * 100;
              return (
                <tr key={fund.id} className="border-t border-slate-100">
                  <td className="p-4 font-medium text-slate-800">{fund.name}</td>
                  <td className="p-4 text-right text-slate-600">${fund.cost.toLocaleString()}</td>
                  <td className="p-4 text-right text-slate-800 font-semibold">${fund.currentValue.toLocaleString()}</td>
                  <td className={`p-4 text-right font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {profit >= 0 ? '+' : ''}{profit.toLocaleString()}
                  </td>
                  <td className={`p-4 text-right font-bold ${roi >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {roi.toFixed(2)}%
                  </td>
                    <td className="p-4 text-center">
                      <button onClick={() => setDeleteTarget({ type: 'funds', id: fund.id, name: fund.name })} className="text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StockPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newStock, setNewStock] = useState<Partial<Stock>>({ symbol: '', name: '', shares: 0, averageCost: 0, currentPrice: 0 });

  // Filtering & Batch Delete State
  const [selectedSource, setSelectedSource] = useState<'all' | 'Cathay' | 'Firstrade' | 'FundRich'>('all');
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const [usdRate, setUsdRate] = useState(32.5); // Default rate

  // AI Recognition State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<any[] | null>(null);

  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);

  const handleRefreshPrices = async () => {
    const symbols = stocks.map(s => s.symbol).filter(Boolean);
    if (symbols.length === 0) return;
    
    setIsRefreshingPrices(true);
    try {
      let latestData;
      try {
        const response = await fetch(`/api/stocks/quotes?symbols=${symbols.join(',')}`);
        if (!response.ok) throw new Error();
        latestData = await response.json();
      } catch (e) {
        // Fallback for static hosting (GitHub Pages)
        console.warn('Backend API unavailable, attempting CORS proxy fallback...');
        const fetchWithProxy = async (sym: string) => {
          const target = /^\d{4,6}$/.test(sym) ? `${sym}.TW` : sym;
          const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${target}`;
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
          const res = await fetch(proxyUrl);
          const json = await res.json();
          const result = JSON.parse(json.contents);
          return result.quoteResponse?.result?.[0];
        };
        const results = await Promise.all(symbols.map(fetchWithProxy));
        latestData = results.filter(Boolean).map(r => ({ ...r, symbol: r.symbol.replace(/\.TW$|\.TWO$/, '') }));
      }
      
      const updates = stocks.map(async (stock) => {
        const found = latestData.find((d: any) => 
          d.symbol === stock.symbol || 
          d.symbol === `${stock.symbol}.TW` || 
          d.symbol === `${stock.symbol}.TWO`
        );
        if (found && found.regularMarketPrice) {
          await updateDoc(doc(db, 'stocks', stock.id), {
            currentPrice: found.regularMarketPrice
          });
        }
      });
      await Promise.all(updates);
    } catch (err) {
      console.error('Refresh prices error:', err);
      alert('更新股價失敗。如果您是使用 GitHub Pages，可能是因為跨網域代理伺服器暫時無法連線。');
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'stocks'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Stock));
      setStocks(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stocks');
    });
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'funds'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Fund));
      setFunds(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'funds');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleAIStockRecognition = async () => {
    if (!aiImage) return;
    setIsAIProcessing(true);
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured. Please set it in Settings.");
      }
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `這是一張股票或基金庫存明細的截圖（可能來自國泰證券、Firstrade 或 鉅亨買基金）。請辨識圖中的資訊並以 JSON 格式回傳一個陣列。
      每個物件包含：
      - symbol: 股票代號或基金代號 (例如: 0050, AAPL, 若為基金則填寫代號或 NA)
      - name: 名稱 (例如: 元大台灣50, Apple, 統一黑馬基金)
      - shares: 持有股數或單位數 (數字)
      - averageCost: 平均成本或申購淨值 (數字)
      - currentPrice: 目前股價或最新淨值 (數字)
      
      請只回傳 JSON 陣列，不要有其他文字。`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: aiImage.split(',')[1]
              }
            }
          ]
        }
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setAiResult(data);
      }
    } catch (error: any) {
      const errorText = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      if (errorText.includes('The document has no pages')) {
        console.warn("AI Recognition Error (Expected):", "The document has no pages.");
        alert('辨識失敗: 圖片內容空白或無法讀取。請上傳有效的截圖。');
      } else {
        console.error("AI Recognition Error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        alert(`辨識失敗: ${errorText}`);
      }
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleImportAIResult = async (source: 'Cathay' | 'Firstrade' | 'FundRich') => {
    if (!aiResult) return;
    try {
      const targetUids = user.uid === 'default-user' ? ['default-user', 'local_default_user'] : ['default-user', 'local_default_user', user.uid];
      if (source === 'FundRich') {
        const q = query(collection(db, 'funds'), where('source', '==', source), where('uid', 'in', targetUids));
        const snapshot = await getDocs(q);
        const batchDelete = snapshot.docs.map(fundDoc => deleteDoc(doc(db, 'funds', fundDoc.id)));
        await Promise.all(batchDelete);

        const batchAdd = aiResult.map(item => {
          return addDoc(collection(db, 'funds'), {
            name: item.name,
            units: item.shares || 0,
            cost: (item.averageCost || 0) * (item.shares || 0),
            currentValue: (item.currentPrice || 0) * (item.shares || 0),
            source,
            uid: user.uid
          });
        });
        await Promise.all(batchAdd);
      } else {
        // 1. Delete existing stocks from the same source
        const stocksToDelete = stocks.filter(s => s.source === source);
        const batchDelete = stocksToDelete.map(stock => deleteDoc(doc(db, 'stocks', stock.id)));
        await Promise.all(batchDelete);

        // 2. Add new stocks with the source field
        const batchAdd = aiResult.map(item => {
          return addDoc(collection(db, 'stocks'), {
            ...item,
            source,
            uid: user.uid
          });
        });
        await Promise.all(batchAdd);
      }
      
      setIsAIModalOpen(false);
      setAiResult(null);
      setAiImage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, source === 'FundRich' ? 'funds' : 'stocks');
    }
  };

  const handleAdd = async () => {
    try {
      const stock = { ...newStock, uid: user.uid };
      await addDoc(collection(db, 'stocks'), stock);
      setIsAdding(false);
      setNewStock({ symbol: '', name: '', shares: 0, averageCost: 0, currentPrice: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stocks');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeleteTarget({ type: 'stocks', id, name });
  };

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [stockData, setStockData] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isFetchingData, setIsFetchingData] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (selectedStock) {
        setIsFetchingData(true);
        try {
          let quote, history;
          try {
            const [quoteRes, historyRes] = await Promise.all([
              fetch(`/api/stock/${selectedStock.symbol}`),
              fetch(`/api/stock/history/${selectedStock.symbol}`)
            ]);
            
            if (!quoteRes.ok || !historyRes.ok) throw new Error();
            
            quote = await quoteRes.json();
            history = await historyRes.json();
          } catch (e) {
            // Fallback for static hosting
            console.warn('Backend API unavailable for details, attempting CORS proxy fallback...');
            const sym = selectedStock.symbol;
            const target = /^\d{4,6}$/.test(sym) ? `${sym}.TW` : sym;
            
            // Fetch Quote
            const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${target}`;
            const quoteProxy = `https://api.allorigins.win/get?url=${encodeURIComponent(quoteUrl)}`;
            const qRes = await fetch(quoteProxy);
            const qJson = await qRes.json();
            const qResult = JSON.parse(qJson.contents);
            quote = qResult.quoteResponse?.result?.[0];

            // Fetch History (Simplified: default to 1 year)
            // Use query2 for chart
            const histUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${target}?range=1y&interval=1d`;
            const histProxy = `https://api.allorigins.win/get?url=${encodeURIComponent(histUrl)}`;
            const hRes = await fetch(histProxy);
            const hJson = await hRes.json();
            const hResult = JSON.parse(hJson.contents);
            const chartData = hResult.chart?.result?.[0];
            
            if (chartData) {
              const { timestamp, indicators } = chartData;
              const closes = indicators.quote[0].close;
              history = timestamp.map((t: number, i: number) => ({
                date: t * 1000,
                close: closes[i]
              })).filter((d: any) => d.close != null);
            }
          }
          
          if (quote) setStockData(quote);
          if (history) setHistoryData(history);
        } catch (err) {
          console.error('Error fetching stock data:', err);
        } finally {
          setIsFetchingData(false);
        }
      } else {
        setStockData(null);
        setHistoryData([]);
      }
    };
    fetchData();
  }, [selectedStock]);

  const filteredStocks = stocks.filter(s => selectedSource === 'all' || s.source === selectedSource);
  const filteredFunds = funds.filter(f => (selectedSource === 'all' || f.source === selectedSource) && f.source === 'FundRich');
  
  const portfolioSummary = [...filteredStocks, ...filteredFunds.map(f => ({
    id: f.id,
    symbol: '基金',
    name: f.name,
    shares: f.units,
    averageCost: f.units > 0 ? f.cost / f.units : 0,
    currentPrice: f.units > 0 ? f.currentValue / f.units : 0,
    source: (f as any).source
  } as Stock))].reduce((acc, s) => {
    const isUsd = s.source === 'Firstrade';
    const cost = s.shares * s.averageCost;
    const val = s.shares * s.currentPrice;
    const profit = val - cost;
    
    acc.totalCost += isUsd ? cost * usdRate : cost;
    acc.totalVal += isUsd ? val * usdRate : val;
    acc.totalProfit += isUsd ? profit * usdRate : profit;
    return acc;
  }, { totalCost: 0, totalVal: 0, totalProfit: 0 });

  const toggleStockSelection = (id: string) => {
    const next = new Set(selectedStocks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStocks(next);
  };

  const handleBatchDelete = async () => {
    try {
      const stockIds = Array.from(selectedStocks).filter(id => stocks.some(s => s.id === id));
      const fundIds = Array.from(selectedStocks).filter(id => funds.some(f => f.id === id));
      
      const batchDeleteStocks = stockIds.map(id => deleteDoc(doc(db, 'stocks', id)));
      const batchDeleteFunds = fundIds.map(id => deleteDoc(doc(db, 'funds', id)));
      
      await Promise.all([...batchDeleteStocks, ...batchDeleteFunds]);
      setSelectedStocks(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'items');
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('確定要刪除所有股票與基金資訊嗎？此操作無法復原。')) return;
    try {
      const batchDeleteStocks = stocks.map(stock => deleteDoc(doc(db, 'stocks', stock.id)));
      const batchDeleteFunds = funds.map(fund => deleteDoc(doc(db, 'funds', fund.id)));
      await Promise.all([...batchDeleteStocks, ...batchDeleteFunds]);
      setSelectedStocks(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'items');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">股票 / 基金投資</h2>
        <div className="flex gap-2">
          <select value={selectedSource} onChange={e => setSelectedSource(e.target.value as any)} className="p-2 border rounded-lg text-sm">
            <option value="all">全部來源</option>
            <option value="Cathay">國泰證券</option>
            <option value="Firstrade">Firstrade</option>
            <option value="FundRich">鉅亨買基金</option>
          </select>
          <button onClick={handleBatchDelete} disabled={selectedStocks.size === 0} className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50">
            <Trash2 size={20} /> 批次刪除 ({selectedStocks.size})
          </button>
          <button onClick={handleDeleteAll} className="flex items-center gap-2 bg-rose-800 text-white px-4 py-2 rounded-lg hover:bg-rose-900 transition-colors">
            <Trash2 size={20} /> 刪除全部
          </button>
          <button 
            onClick={handleRefreshPrices} 
            disabled={isRefreshingPrices || stocks.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={20} className={isRefreshingPrices ? 'animate-spin' : ''} />
            {isRefreshingPrices ? '更新中...' : '更新即時現價'}
          </button>
          <button 
            onClick={() => setIsAIModalOpen(true)} 
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Camera size={20} /> AI 掃描匯入
          </button>
          <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={20} /> 新增股票
          </button>
        </div>
      </div>

      {/* Summary Table & Portfolio Total */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">投資組合損益表</h3>
          <div className="flex gap-4 text-sm">
            <div className="text-slate-500">總成本: <span className="font-bold text-slate-800">${Math.floor(portfolioSummary.totalCost).toLocaleString()} TWD</span></div>
            <div className="text-slate-500">總市值: <span className="font-bold text-slate-800">${Math.floor(portfolioSummary.totalVal).toLocaleString()} TWD</span></div>
            <div className={`font-bold ${portfolioSummary.totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              總損益: ${Math.floor(portfolioSummary.totalProfit).toLocaleString()} TWD
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allIds = new Set([...stocks.map(s => s.id), ...funds.map(f => f.id)]);
                        setSelectedStocks(allIds);
                      } else {
                        setSelectedStocks(new Set());
                      }
                    }}
                    checked={selectedStocks.size > 0 && selectedStocks.size === (stocks.length + funds.length)}
                  />
                </th>
                <th className="px-4 py-3">股票/基金</th>
                <th className="px-4 py-3">來源</th>
                <th className="px-4 py-3">股數/單位</th>
                <th className="px-4 py-3">成本</th>
                <th className="px-4 py-3">市值</th>
                <th className="px-4 py-3">損益</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.sort((a,b) => (a.source || '').localeCompare(b.source || '')).map(stock => {
                const isUsd = stock.source === 'Firstrade';
                const cost = stock.shares * stock.averageCost;
                const val = stock.shares * stock.currentPrice;
                const profit = val - cost;
                return (
                  <tr key={stock.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox" 
                        checked={selectedStocks.has(stock.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleStockSelection(stock.id);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-indigo-600 hover:underline" onClick={() => setSelectedStock(stock)}>{stock.symbol} ({stock.name})</td>
                    <td className="px-4 py-3">{stock.source}</td>
                    <td className="px-4 py-3">{stock.shares.toLocaleString()}</td>
                    <td className="px-4 py-3">${Math.floor(cost).toLocaleString()} {isUsd ? 'USD' : 'TWD'}</td>
                    <td className="px-4 py-3">${Math.floor(val).toLocaleString()} {isUsd ? 'USD' : 'TWD'}</td>
                    <td className={`px-4 py-3 font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      ${Math.floor(profit).toLocaleString()} {isUsd ? 'USD' : 'TWD'}
                      {isUsd && <span className="text-xs text-slate-400 ml-1">(${Math.floor(profit * usdRate).toLocaleString()} TWD)</span>}
                    </td>
                  </tr>
                );
              })}
              {filteredFunds.map(fund => {
                const isUsd = false;
                const cost = fund.cost;
                const val = fund.currentValue;
                const profit = val - cost;
                return (
                  <tr key={fund.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox" 
                        checked={selectedStocks.has(fund.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleStockSelection(fund.id);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-indigo-600">基金 ({fund.name})</td>
                    <td className="px-4 py-3">{fund.source}</td>
                    <td className="px-4 py-3">{fund.units.toLocaleString()}</td>
                    <td className="px-4 py-3">${Math.floor(cost).toLocaleString()} TWD</td>
                    <td className="px-4 py-3">${Math.floor(val).toLocaleString()} TWD</td>
                    <td className={`px-4 py-3 font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      ${Math.floor(profit).toLocaleString()} TWD
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Detail Modal */}
      <AnimatePresence>
        {selectedStock && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-800">{selectedStock.symbol} - {selectedStock.name}</h3>
                <button onClick={() => setSelectedStock(null)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
              </div>
              <div className="space-y-4">
                {isFetchingData ? (
                  <div className="text-center py-10">載入中...</div>
                ) : stockData ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-lg">
                        <div className="text-sm text-slate-500">目前價格</div>
                        <div className="font-bold text-xl">{stockData.regularMarketPrice ?? 'N/A'} {stockData.currency ?? ''}</div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg">
                        <div className="text-sm text-slate-500">漲跌幅</div>
                        <div className={`font-bold text-xl ${(stockData.regularMarketChangePercent ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {(stockData.regularMarketChangePercent ?? 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-lg">
                        <div className="text-sm text-slate-500">開盤價</div>
                        <div className="font-bold">{stockData.regularMarketOpen ?? 'N/A'}</div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg">
                        <div className="text-sm text-slate-500">最高價</div>
                        <div className="font-bold">{stockData.regularMarketDayHigh ?? 'N/A'}</div>
                      </div>
                    </div>
                    <div className="h-[300px] w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString()} />
                          <YAxis domain={['auto', 'auto']} />
                          <Tooltip labelFormatter={(date) => new Date(date).toLocaleDateString()} />
                          <Legend />
                          <Line type="monotone" dataKey="close" stroke="#8884d8" name="收盤價" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 text-slate-500">無法取得即時資料</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Recognition Modal */}
      <AnimatePresence>
        {isAIModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
                <h3 className="text-xl font-bold text-emerald-800 flex items-center gap-2">
                  <Camera className="text-emerald-600" /> AI 股票庫存掃描
                </h3>
                <button onClick={() => setIsAIModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6" onPaste={(e) => {
                const item = e.clipboardData.items[0];
                if (item?.type.startsWith('image')) {
                  const file = item.getAsFile();
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setAiImage(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }
              }}>
                {!aiImage ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      id="stock-ai-upload" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setAiImage(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <label htmlFor="stock-ai-upload" className="cursor-pointer flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                        <Plus size={32} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">上傳或貼上庫存截圖</p>
                        <p className="text-sm text-slate-500">支援國泰證券、Firstrade 等券商截圖</p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden border border-slate-200">
                      <img src={aiImage} alt="Preview" className="w-full h-auto max-h-64 object-contain bg-slate-50" />
                      <button 
                        onClick={() => { setAiImage(null); setAiResult(null); }}
                        className="absolute top-2 right-2 bg-white/80 backdrop-blur p-1 rounded-full text-rose-500 shadow-sm"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {!aiResult && (
                      <button 
                        onClick={handleAIStockRecognition}
                        disabled={isAIProcessing}
                        className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isAIProcessing ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            AI 辨識中...
                          </>
                        ) : (
                          <>開始辨識</>
                        )}
                      </button>
                    )}

                    {aiResult && (
                      <div className="space-y-4">
                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                          <h4 className="font-bold text-emerald-800 mb-2">辨識結果</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {aiResult.map((item, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-lg border border-emerald-100 text-sm flex justify-between items-center">
                                <div>
                                  <span className="font-bold text-slate-800">{item.symbol}</span>
                                  <span className="text-slate-500 ml-2">{item.name}</span>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium text-slate-700">{item.shares.toLocaleString()} 股</div>
                                  <div className="text-xs text-slate-400">成本: ${item.averageCost}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleImportAIResult('Cathay')}
                          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
                        >
                          <Save size={20} /> 匯入為國泰證券資料
                        </button>
                        <button 
                          onClick={() => handleImportAIResult('Firstrade')}
                          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 flex items-center justify-center gap-2"
                        >
                          <Save size={20} /> 匯入為 Firstrade 資料
                        </button>
                        <button 
                          onClick={() => handleImportAIResult('FundRich')}
                          className="w-full bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 flex items-center justify-center gap-2"
                        >
                          <Save size={20} /> 匯入為鉅亨買基金資料
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isAdding && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="股票代號" className="p-2 border rounded-md" value={newStock.symbol} onChange={e => setNewStock({...newStock, symbol: e.target.value})} />
            <input type="text" placeholder="股票名稱" className="p-2 border rounded-md" value={newStock.name} onChange={e => setNewStock({...newStock, name: e.target.value})} />
            <input type="number" placeholder="持有股數" className="p-2 border rounded-md" value={newStock.shares} onChange={e => setNewStock({...newStock, shares: Number(e.target.value)})} />
            <input type="number" placeholder="平均成本" className="p-2 border rounded-md" value={newStock.averageCost} onChange={e => setNewStock({...newStock, averageCost: Number(e.target.value)})} />
            <input type="number" placeholder="目前股價" className="p-2 border rounded-md" value={newStock.currentPrice} onChange={e => setNewStock({...newStock, currentPrice: Number(e.target.value)})} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
            <button onClick={handleAdd} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">儲存</button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStocks.map(stock => {
          const totalCost = stock.shares * stock.averageCost;
          const currentVal = stock.shares * stock.currentPrice;
          const profit = currentVal - totalCost;
          const roi = (profit / totalCost) * 100;
          return (
            <div key={stock.id} className={`bg-white p-6 rounded-xl shadow-sm border ${selectedStocks.has(stock.id) ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'} relative group`}>
              <input type="checkbox" checked={selectedStocks.has(stock.id)} onChange={() => toggleStockSelection(stock.id)} className="absolute top-4 left-4" />
              <button onClick={() => handleDelete(stock.id, `${stock.symbol} ${stock.name}`)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={18} />
              </button>
              <div className="flex justify-between items-start mb-4 ml-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{stock.symbol}</h3>
                  <p className="text-sm text-slate-500">{stock.name} ({stock.source})</p>
                </div>
                <div className={`text-right ${profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  <p className="text-lg font-bold">{Math.floor(roi)}%</p>
                  <p className="text-xs font-medium">{profit >= 0 ? '+' : ''}{Math.floor(profit).toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">持有股數</span>
                  <span className="text-slate-800 font-medium">{Math.floor(stock.shares).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">平均成本</span>
                  <span className="text-slate-800 font-medium">${Math.floor(stock.averageCost)} {stock.source === 'Firstrade' ? 'USD' : 'TWD'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">目前市值</span>
                  <span className="text-slate-800 font-bold">${Math.floor(currentVal).toLocaleString()} {stock.source === 'Firstrade' ? 'USD' : 'TWD'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DashboardPage = ({ user, summary }: { user: User, summary: any }) => {
  const [data, setData] = useState({
    banks: [] as BankAccount[],
    stocks: [] as Stock[],
    funds: [] as Fund[],
    cards: [] as CreditCard[]
  });
  const [usdRate] = useState(32.5); // Default rate if not fetched
  const [isTransferring, setIsTransferring] = useState(false);

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    
    const unsubBanks = onSnapshot(query(collection(db, 'bankAccounts'), where('uid', 'in', targetUids)), s => 
      setData(prev => ({ ...prev, banks: s.docs.map(d => ({ ...d.data(), id: d.id } as BankAccount)) }))
    );
    const unsubStocks = onSnapshot(query(collection(db, 'stocks'), where('uid', 'in', targetUids)), s => 
      setData(prev => ({ ...prev, stocks: s.docs.map(d => ({ ...d.data(), id: d.id } as Stock)) }))
    );
    const unsubFunds = onSnapshot(query(collection(db, 'funds'), where('uid', 'in', targetUids)), s => 
      setData(prev => ({ ...prev, funds: s.docs.map(d => ({ ...d.data(), id: d.id } as Fund)) }))
    );
    const unsubCards = onSnapshot(query(collection(db, 'creditCards'), where('uid', 'in', targetUids)), s => 
      setData(prev => ({ ...prev, cards: s.docs.map(d => ({ ...d.data(), id: d.id } as CreditCard)) }))
    );
    return () => { unsubBanks(); unsubStocks(); unsubFunds(); unsubCards(); };
  }, [user.uid]);

  // Use values directly from the pre-calculated global summary for consistency
  const bankTotal = summary.banks;
  const stockTotal = summary.stocks;
  const fundTotal = summary.funds;
  const cardDebt = summary.debt;
  const totalLoan = summary.loans;
  
  const totalAssets = bankTotal + stockTotal + fundTotal - cardDebt - totalLoan;

  const chartData = [
    { name: '銀行存款', value: Math.max(0, bankTotal), color: '#6366f1' },
    { name: '股票投資', value: Math.max(0, stockTotal), color: '#10b981' },
    { name: '基金投資', value: Math.max(0, fundTotal), color: '#f59e0b' },
    { name: '負債 (卡/貸)', value: Math.max(0, cardDebt + totalLoan), color: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">總資產概況</h2>
          <p className="text-sm text-slate-500">所有財務帳戶的匯總資訊</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">淨資產總額</p>
          <p className="text-3xl font-black text-slate-800">${Math.round(totalAssets).toLocaleString()}</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit">
            <TrendingUp size={14} />
            <span>資產健康</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">銀行存款</p>
          <p className="text-2xl font-bold text-indigo-600">${Math.round(bankTotal).toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">投資市值 (股/基)</p>
          <p className="text-2xl font-bold text-emerald-600">${Math.round(stockTotal + fundTotal).toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">信用卡負債</p>
          <p className="text-2xl font-bold text-rose-500">${Math.round(cardDebt).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-8 flex items-center gap-2">
            <PieChart className="text-indigo-600" size={20} /> 資產比例
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie data={chartData} dataKey="value" innerRadius={60} outerRadius={100} paddingAngle={5}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`$${Math.round(value).toLocaleString()}`, '金額']}
                />
                <Legend />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" size={20} /> 各項明細
          </h3>
          <div className="space-y-4">
            {chartData.map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-2 h-10 rounded-full" style={{ backgroundColor: item.color }} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-700">{item.name}</p>
                  <p className="text-xs text-slate-400">{Math.round((item.value / totalAssets) * 100)}%</p>
                </div>
                <p className="font-bold text-slate-800">${Math.round(item.value).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PRESET_TAX_STANDARDS: TaxStandard[] = [
  {
    id: 'preset-110', year: 110, uid: 'system',
    exemptionBase: 88000, exemptionSenior: 132000, standardDeductionSingle: 120000, standardDeductionMarried: 240000,
    salaryDeductionUnit: 200000, savingsDeductionLimit: 270000, disabilityDeductionUnit: 200000, educationDeductionUnit: 25000,
    preschoolDeductionUnit: 120000, longTermCareDeductionUnit: 120000, basicLivingExpenseUnit: 192000,
    taxBrackets: [
      { limit: 540000, rate: 0.05, adjustment: 0 },
      { limit: 1210000, rate: 0.12, adjustment: 37800 },
      { limit: 2420000, rate: 0.20, adjustment: 134600 },
      { limit: 4530000, rate: 0.30, adjustment: 376600 },
      { limit: Infinity, rate: 0.40, adjustment: 829600 },
    ]
  },
  {
    id: 'preset-111', year: 111, uid: 'system',
    exemptionBase: 92000, exemptionSenior: 138000, standardDeductionSingle: 124000, standardDeductionMarried: 248000,
    salaryDeductionUnit: 207000, savingsDeductionLimit: 270000, disabilityDeductionUnit: 207000, educationDeductionUnit: 25000,
    preschoolDeductionUnit: 120000, longTermCareDeductionUnit: 120000, basicLivingExpenseUnit: 196000,
    taxBrackets: [
      { limit: 560000, rate: 0.05, adjustment: 0 },
      { limit: 1260000, rate: 0.12, adjustment: 39200 },
      { limit: 2520000, rate: 0.20, adjustment: 140000 },
      { limit: 4720000, rate: 0.30, adjustment: 392000 },
      { limit: Infinity, rate: 0.40, adjustment: 864000 },
    ]
  },
  {
    id: 'preset-112', year: 112, uid: 'system',
    exemptionBase: 92000, exemptionSenior: 138000, standardDeductionSingle: 124000, standardDeductionMarried: 248000,
    salaryDeductionUnit: 207000, savingsDeductionLimit: 270000, disabilityDeductionUnit: 207000, educationDeductionUnit: 25000,
    preschoolDeductionUnit: 120000, longTermCareDeductionUnit: 120000, basicLivingExpenseUnit: 202000,
    taxBrackets: [
      { limit: 560000, rate: 0.05, adjustment: 0 },
      { limit: 1260000, rate: 0.12, adjustment: 39200 },
      { limit: 2520000, rate: 0.20, adjustment: 140000 },
      { limit: 4720000, rate: 0.30, adjustment: 392000 },
      { limit: Infinity, rate: 0.40, adjustment: 864000 },
    ]
  },
  {
    id: 'preset-113', year: 113, uid: 'system',
    exemptionBase: 97000, exemptionSenior: 145500, standardDeductionSingle: 131000, standardDeductionMarried: 262000,
    salaryDeductionUnit: 218000, savingsDeductionLimit: 270000, disabilityDeductionUnit: 218000, educationDeductionUnit: 25000,
    preschoolDeductionUnit: 120000, longTermCareDeductionUnit: 120000, basicLivingExpenseUnit: 209000,
    taxBrackets: [
      { limit: 590000, rate: 0.05, adjustment: 0 },
      { limit: 1330000, rate: 0.12, adjustment: 41300 },
      { limit: 2660000, rate: 0.20, adjustment: 147700 },
      { limit: 4980000, rate: 0.30, adjustment: 413700 },
      { limit: Infinity, rate: 0.40, adjustment: 911700 },
    ]
  },
  {
    id: 'preset-114', year: 114, uid: 'system',
    exemptionBase: 97000, exemptionSenior: 145500, standardDeductionSingle: 131000, standardDeductionMarried: 262000,
    salaryDeductionUnit: 218000, savingsDeductionLimit: 270000, disabilityDeductionUnit: 218000, educationDeductionUnit: 25000,
    preschoolDeductionUnit: 120000, longTermCareDeductionUnit: 120000, basicLivingExpenseUnit: 209000,
    taxBrackets: [
      { limit: 590000, rate: 0.05, adjustment: 0 },
      { limit: 1330000, rate: 0.12, adjustment: 41300 },
      { limit: 2660000, rate: 0.20, adjustment: 147700 },
      { limit: 4980000, rate: 0.30, adjustment: 413700 },
      { limit: Infinity, rate: 0.40, adjustment: 911700 },
    ]
  },
  {
    id: 'preset-115', year: 115, uid: 'system',
    exemptionBase: 97000, exemptionSenior: 145500, standardDeductionSingle: 131000, standardDeductionMarried: 262000,
    salaryDeductionUnit: 218000, savingsDeductionLimit: 270000, disabilityDeductionUnit: 218000, educationDeductionUnit: 25000,
    preschoolDeductionUnit: 120000, longTermCareDeductionUnit: 120000, basicLivingExpenseUnit: 209000,
    taxBrackets: [
      { limit: 590000, rate: 0.05, adjustment: 0 },
      { limit: 1330000, rate: 0.12, adjustment: 41300 },
      { limit: 2660000, rate: 0.20, adjustment: 147700 },
      { limit: 4980000, rate: 0.30, adjustment: 413700 },
      { limit: Infinity, rate: 0.40, adjustment: 911700 },
    ]
  }
];

const DEFAULT_TAX_STANDARDS: Partial<TaxStandard> = PRESET_TAX_STANDARDS[3]; // Default to 113

const INITIAL_TAX_RECORD: Partial<TaxRecord> = {
  year: new Date().getFullYear() - 1912,
  parameterYear: new Date().getFullYear() - 1912,
  salaryUser: 0,
  salarySpouse: 0,
  profitIncome: 0,
  interestIncome: 0,
  otherIncome: 0,
  exemptionsCount: 1,
  exemptionsSeniorCount: 0,
  isMarried: false,
  propertyLossDeduction: 0,
  savingsDeduction: 0,
  disabilityCount: 0,
  educationCount: 0,
  preschoolCount: 0,
  longTermCareCount: 0,
  startupInvestmentDeduction: 0,
  investmentCredits: 0,
  homePurchaseCredits: 0,
  withholding: 0,
  dividendCredits: 0,
  mainlandTaxCredits: 0,
  itemizedDeduction: 0, // 列舉扣除額
};

// --- Tax Calculation Display Component ---
const CalculationBreakdown = ({ tax, result, std }: { tax: Partial<TaxRecord>, result: any, std: TaxStandard }) => {
  return (
    <div className="space-y-8 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 overflow-x-auto">
      <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
        <Calculator size={24} className="text-indigo-600" />
          {tax.year} 年度稅額計算詳解
      </h3>

      {/* 1. 薪資所得計算式 */}
      <section className="space-y-3">
        <h4 className="text-sm font-bold text-slate-700 bg-slate-200/50 px-3 py-1 rounded-md inline-block">★ 薪資所得計算式</h4>
        <table className="w-full text-xs text-left border-collapse border border-slate-200 bg-white">
          <thead className="bg-slate-50">
            <tr>
              <th className="border border-slate-200 p-2">對象</th>
              <th className="border border-slate-200 p-2 text-right">薪資收入總額</th>
              <th className="border border-slate-200 p-2 text-right">薪資所得特別扣除額</th>
              <th className="border border-slate-200 p-2 text-right">薪資所得</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-200 p-2 font-medium">本人</td>
              <td className="border border-slate-200 p-2 text-right">${(tax.salaryUser || 0).toLocaleString()}</td>
              <td className="border border-slate-200 p-2 text-right text-rose-500">-${(result.salaryUserDeduction || 0).toLocaleString()}</td>
              <td className="border border-slate-200 p-2 text-right font-bold">${(result.salaryUserAfterDeduction || 0).toLocaleString()}</td>
            </tr>
            {tax.isMarried && (
              <tr>
                <td className="border border-slate-200 p-2 font-medium">配偶</td>
                <td className="border border-slate-200 p-2 text-right">${(tax.salarySpouse || 0).toLocaleString()}</td>
                <td className="border border-slate-200 p-2 text-right text-rose-500">-${(result.salarySpouseDeduction || 0).toLocaleString()}</td>
                <td className="border border-slate-200 p-2 text-right font-bold">${(result.salarySpouseAfterDeduction || 0).toLocaleString()}</td>
              </tr>
            )}
            <tr className="bg-slate-50 font-black">
              <td className="border border-slate-200 p-2 text-center" colSpan={3}>合 計</td>
              <td className="border border-slate-200 p-2 text-right text-indigo-600">${((result.salaryUserAfterDeduction || 0) + (result.salarySpouseAfterDeduction || 0)).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2 font-medium" colSpan={3}>其他所得 (租賃/執業/中獎等)</td>
              <td className="border border-slate-200 p-2 text-right font-bold">${(tax.otherIncome || 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 2. 免稅額 */}
      <section className="space-y-3">
        <h4 className="text-sm font-bold text-slate-700 bg-slate-200/50 px-3 py-1 rounded-md inline-block">★ 免稅額詳情</h4>
        <table className="w-full text-xs text-left border-collapse border border-slate-200 bg-white">
          <thead className="bg-slate-50">
            <tr>
              <th className="border border-slate-200 p-2">類別</th>
              <th className="border border-slate-200 p-2 text-right">單價</th>
              <th className="border border-slate-200 p-2 text-center">人數</th>
              <th className="border border-slate-200 p-2 text-right">免稅額</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-200 p-2">一般免稅額 (本人/配偶/扶養)</td>
              <td className="border border-slate-200 p-2 text-right">${std.exemptionBase.toLocaleString()}</td>
              <td className="border border-slate-200 p-2 text-center">{tax.exemptionsCount || 0}</td>
              <td className="border border-slate-200 p-2 text-right font-bold">${((tax.exemptionsCount || 0) * std.exemptionBase).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2">70歲以上扶養親屬</td>
              <td className="border border-slate-200 p-2 text-right">${std.exemptionSenior.toLocaleString()}</td>
              <td className="border border-slate-200 p-2 text-center">{tax.exemptionsSeniorCount || 0}</td>
              <td className="border border-slate-200 p-2 text-right font-bold">${((tax.exemptionsSeniorCount || 0) * std.exemptionSenior).toLocaleString()}</td>
            </tr>
            <tr className="bg-slate-50 font-black">
              <td className="border border-slate-200 p-2 text-center" colSpan={3}>合 計</td>
              <td className="border border-slate-200 p-2 text-right text-indigo-600">${result.totalExemptions.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 3. 扣除額 */}
      <section className="space-y-3">
        <h4 className="text-sm font-bold text-slate-700 bg-slate-200/50 px-3 py-1 rounded-md inline-block">★ 扣除額合計</h4>
        <table className="w-full text-xs text-left border-collapse border border-slate-200 bg-white">
          <thead className="bg-slate-50">
            <tr>
              <th className="border border-slate-200 p-2">項目</th>
              <th className="border border-slate-200 p-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-200 p-2">一般扣除額 ({tax.isMarried ? '有配偶' : '單身'})</td>
              <td className="border border-slate-200 p-2 text-right">
                <div className="flex flex-col items-end">
                  <span className={result.isItemized ? 'text-slate-400 line-through' : 'font-bold'}>標扣: ${result.standardDeduction.toLocaleString()}</span>
                  <span className={result.isItemized ? 'font-bold text-emerald-600' : 'text-slate-400'}>列舉: ${(tax.itemizedDeduction || 0).toLocaleString()}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2">儲蓄投資特別扣除額 (限額27萬)</td>
              <td className="border border-slate-200 p-2 text-right">${(result.savingsDeduction || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2">身心障礙特別扣除額 ({tax.disabilityCount}人)</td>
              <td className="border border-slate-200 p-2 text-right">${((tax.disabilityCount || 0) * std.disabilityDeductionUnit).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2">教育學費特別扣除額 ({tax.educationCount}人)</td>
              <td className="border border-slate-200 p-2 text-right">${((tax.educationCount || 0) * std.educationDeductionUnit).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2">幼兒學前特別扣除額 ({tax.preschoolCount}人)</td>
              <td className="border border-slate-200 p-2 text-right">${((tax.preschoolCount || 0) * std.preschoolDeductionUnit).toLocaleString()}</td>
            </tr>
             <tr>
              <td className="border border-slate-200 p-2">長期照顧特別扣除額 ({tax.longTermCareCount}人)</td>
              <td className="border border-slate-200 p-2 text-right">${((tax.longTermCareCount || 0) * std.longTermCareDeductionUnit).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2">財產交易損失扣除額</td>
              <td className="border border-slate-200 p-2 text-right">${(tax.propertyLossDeduction || 0).toLocaleString()}</td>
            </tr>
            <tr className="bg-slate-50 font-black">
              <td className="border border-slate-200 p-2">合 計</td>
              <td className="border border-slate-200 p-2 text-right text-indigo-600">${result.specialDeductionsTotalPlusGeneral.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 4. 基本生活費差額 */}
      <section className="space-y-3">
        <h4 className="text-sm font-bold text-slate-700 bg-slate-200/50 px-3 py-1 rounded-md inline-block">★ 基本生活費差額計算</h4>
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-slate-100 p-2 rounded-lg">(基礎金額 ${std.basicLivingExpenseUnit.toLocaleString()} × 人數 {result.headcount})</span>
            <span className="font-bold text-slate-400">－</span>
            <span className="bg-slate-100 p-2 rounded-lg">(免稅額 + 標扣 + 特扣合計 ${result.bleComparison.toLocaleString()})</span>
            <span className="font-bold text-slate-400">＝</span>
            <span className={`p-2 rounded-lg font-bold ${result.bleDifference > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
              基本生活費差額: ${result.bleDifference.toLocaleString()}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 italic font-medium">※ 特扣合計包含：儲蓄、身障、教育、幼兒、長照特別扣除額</p>
        </div>
      </section>

      {/* 5. 股利抵減 */}
      <section className="space-y-3">
        <h4 className="text-sm font-bold text-slate-700 bg-slate-200/50 px-3 py-1 rounded-md inline-block">★ 股利及盈餘可抵減稅額</h4>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
           <div className="flex items-center gap-3 text-xs">
              <span className="bg-slate-100 p-2 rounded-lg">股利總額 ${ (tax.profitIncome || 0).toLocaleString() }</span>
              <span className="font-bold text-slate-400">×</span>
              <span className="bg-slate-100 p-2 rounded-lg">8.5%</span>
              <span className="font-bold text-slate-400">＝</span>
              <span className="bg-indigo-100 p-2 rounded-lg font-bold text-indigo-700">${ result.divCreditRaw.toLocaleString() }</span>
              <span className="text-[10px] text-slate-400">(上限8萬元)</span>
              <span className="font-bold text-slate-400">等於</span>
              <span className="bg-emerald-100 p-2 rounded-lg font-bold text-emerald-700">${ result.divCredit.toLocaleString() }</span>
           </div>
        </div>
      </section>

      {/* 6. 最終稅額計算 */}
      <section className="space-y-6 pt-4 border-t border-slate-200">
        <h4 className="text-sm font-black text-indigo-600 border-l-4 border-indigo-600 pl-3">★ 稅額總結計算式</h4>
        
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-indigo-100 space-y-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">第一階段：課稅所得額</p>
            <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed">
              <span className="bg-white px-3 py-2 rounded-xl border border-indigo-50">本薪所得 ${Math.round((result.salaryUserAfterDeduction || 0) + (result.salarySpouseAfterDeduction || 0)).toLocaleString()}</span>
              <span className="text-slate-400 font-bold">＋</span>
              <span className="bg-white px-3 py-2 rounded-xl border border-indigo-50">營利所得 ${Math.round(tax.profitIncome || 0).toLocaleString()}</span>
              <span className="text-slate-400 font-bold">＋</span>
              <span className="bg-white px-3 py-2 rounded-xl border border-indigo-50">利息所得 ${Math.round(tax.interestIncome || 0).toLocaleString()}</span>
              <span className="text-slate-400 font-bold">＋</span>
              <span className="bg-white px-3 py-2 rounded-xl border border-indigo-50">其他所得 ${Math.round(tax.otherIncome || 0).toLocaleString()}</span>
              <span className="text-slate-400 font-bold">＝</span>
              <span className="bg-slate-50 px-3 py-2 rounded-xl border border-indigo-100">所得總額 ${result.totalIncome.toLocaleString()}</span>
              
              <div className="w-full h-0 border-t border-dashed border-slate-200 my-1"></div>
              
              <span className="bg-slate-50 px-3 py-2 rounded-xl">所得總額 ${result.totalIncome.toLocaleString()}</span>
              <span className="text-slate-400 font-bold">－</span>
              <span className="bg-slate-50 px-3 py-2 rounded-xl">免稅額 ${result.totalExemptions.toLocaleString()}</span>
              <span className="text-slate-400 font-bold">－</span>
              <span className="bg-slate-50 px-3 py-2 rounded-xl">扣除額及差額 ${(result.specialDeductionsTotalPlusGeneral + (result.bleDifference || 0)).toLocaleString()}</span>
              {tax.startupInvestmentDeduction && (
                 <>
                   <span className="text-slate-400 font-bold">－</span>
                   <span className="bg-slate-50 px-3 py-2 rounded-xl">新創減除 ${tax.startupInvestmentDeduction.toLocaleString()}</span>
                 </>
              )}
              <span className="text-slate-400 font-bold">＝</span>
              <span className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black">課稅所得額 ${result.netTaxableIncome.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-indigo-100 space-y-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">第二階段：應納稅額</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
               <span className="bg-slate-50 px-3 py-2 rounded-xl">所得 ${result.netTaxableIncome.toLocaleString()}</span>
               <span className="text-slate-400 font-bold">×</span>
               <span className="bg-slate-50 px-3 py-2 rounded-xl">稅率 {result.bracket.rate * 100}%</span>
               <span className="text-slate-400 font-bold">－</span>
               <span className="bg-slate-50 px-3 py-2 rounded-xl">累進差額 ${result.bracket.adjustment.toLocaleString()}</span>
               <span className="text-slate-400 font-bold">＝</span>
               <span className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black">應納稅額 ${result.taxPayable.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-indigo-100 space-y-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">第三階段：實際退補</p>
            <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed">
              <span className="bg-slate-50 px-3 py-2 rounded-xl">應納稅額 ${result.taxPayable.toLocaleString()}</span>
              <span className="text-slate-400 font-bold">－</span>
              <span className="bg-slate-50 px-3 py-2 rounded-xl text-emerald-600">扣繳稅額 ${tax.withholding?.toLocaleString() || 0}</span>
              <span className="text-slate-400 font-bold">－</span>
              <span className="bg-slate-50 px-3 py-2 rounded-xl text-emerald-600">股利抵減 ${result.divCredit.toLocaleString()}</span>
              {(tax.investmentCredits || 0) > 0 && <><span className="text-slate-400 font-bold">－</span><span className="bg-slate-50 px-3 py-2 rounded-xl text-emerald-600">投資抵減 ${tax.investmentCredits?.toLocaleString()}</span></>}
              {(tax.homePurchaseCredits || 0) > 0 && <><span className="text-slate-400 font-bold">－</span><span className="bg-slate-50 px-3 py-2 rounded-xl text-emerald-600">房貸利息抵減 ${tax.homePurchaseCredits?.toLocaleString()}</span></>}
              {(tax.mainlandTaxCredits || 0) > 0 && <><span className="text-slate-400 font-bold">－</span><span className="bg-slate-50 px-3 py-2 rounded-xl text-emerald-600">大陸地區可扣抵 ${tax.mainlandTaxCredits?.toLocaleString()}</span></>}
              <span className="text-slate-400 font-bold">＝</span>
              <span className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black">應補(退)稅額 ${result.finalTaxDue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const TaxPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [viewMode, setViewMode] = useState<'calculator' | 'records' | 'standards'>('calculator');
  const [taxes, setTaxes] = useState<TaxRecord[]>([]);
  const [standards, setStandards] = useState<TaxStandard[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTax, setNewTax] = useState<Partial<TaxRecord>>(INITIAL_TAX_RECORD);
  const [isAddingStandard, setIsAddingStandard] = useState(false);
  const [newStandard, setNewStandard] = useState<Partial<TaxStandard>>(DEFAULT_TAX_STANDARDS);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingStandard, setIsAnalyzingStandard] = useState(false);
  const [aiScanYear, setAiScanYear] = useState<number>(new Date().getFullYear() - 1912); // 民國年

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const unsubTaxes = onSnapshot(query(collection(db, 'taxes'), where('uid', 'in', targetUids)), s => 
      setTaxes(s.docs.map(d => ({ ...d.data(), id: d.id } as TaxRecord)).sort((a,b) => b.year - a.year))
    );
    const unsubStds = onSnapshot(query(collection(db, 'taxStandards'), where('uid', 'in', targetUids)), s => 
      setStandards(s.docs.map(d => ({ ...d.data(), id: d.id } as TaxStandard)).sort((a,b) => b.year - a.year))
    );
    return () => { unsubTaxes(); unsubStds(); };
  }, [user.uid]);

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const result = await analyzeTaxDocument(base64, file.type);
          if (result) {
            // Use the selected year if provided, otherwise use the one detected by AI
            const finalYear = aiScanYear || (result.year || 113);
            setNewTax({
              ...newTax,
              ...result,
              year: finalYear,
              uid: user.uid
            });
            setIsAdding(true);
          }
        } catch (err: any) {
          const errorText = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
          if (errorText.includes('The document has no pages')) {
            console.warn("Tax document AI failed (Expected):", "The document has no pages.");
            alert('辨識失敗: 文件內容空白或為無法讀取的格式。請確保您上傳的是清晰的圖片或有效的 PDF 文件。');
          } else {
            console.error("Tax document AI failed:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
            alert(`辨識失敗: ${errorText}`);
          }
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('檔案讀取失敗');
      setIsAnalyzing(false);
    }
  };

  const handleStandardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAnalyzingStandard(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const result = await analyzeTaxStandards(base64, file.type);
          if (result) {
            setNewStandard({
              ...newStandard,
              ...result,
              uid: user.uid
            });
            setIsAddingStandard(true);
          }
        } catch (err: any) {
          const errorText = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
          if (errorText.includes('The document has no pages')) {
            console.warn("Tax standard AI failed (Expected):", "The document has no pages.");
            alert('辨識失敗: 文件內容空白或為無法讀取的格式。請確保您上傳的是清晰的圖片或有效的 PDF 文件。');
          } else {
            console.error("Tax standard AI failed:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
            alert(`辨識失敗: ${errorText}`);
          }
        } finally {
          setIsAnalyzingStandard(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('檔案讀取失敗');
      setIsAnalyzingStandard(false);
    }
  };

  const handleSaveStandard = async () => {
    try {
      if (newStandard.id) {
        await updateDoc(doc(db, 'taxStandards', newStandard.id), { ...newStandard, uid: user.uid });
      } else {
        await addDoc(collection(db, 'taxStandards'), { ...newStandard, uid: user.uid });
      }
      setIsAddingStandard(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'taxStandards');
    }
  };

  const handleSaveTax = async () => {
    try {
      if (newTax.id) {
        await updateDoc(doc(db, 'taxes', newTax.id), { ...newTax, updatedAt: new Date() });
        alert('稅務紀錄已更新');
      } else {
        await addDoc(collection(db, 'taxes'), { ...newTax, uid: user.uid, createdAt: new Date() });
        alert('稅務紀錄已儲存');
      }
      setIsAdding(false);
      setViewMode('records');
    } catch (err) {
      handleFirestoreError(err, newTax.id ? OperationType.UPDATE : OperationType.CREATE, 'taxes');
    }
  };

  const handleDeleteTax = async (id: string, name: string, e: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    console.log('Delete button clicked for ID:', id);
    if (!id) {
      window.alert('錯誤：無法獲取紀錄 ID');
      return;
    }
    
    setDeleteTarget({ type: 'taxes', id, name: `${name} 年度稅務紀錄` });
  };

  const handleDeleteStandard = async (id: string, year: string | number) => {
    if (!id) {
      window.alert('錯誤：無法獲取參數 ID');
      return;
    }
    setDeleteTarget({ type: 'taxStandards', id, name: `${year} 年度稅務參數` });
  };

  const calculateResult = (record: Partial<TaxRecord>) => {
    const targetYear = record.parameterYear || record.year || 113;
    const std = standards.find(s => s.year === targetYear) || (PRESET_TAX_STANDARDS.find(s => s.year === targetYear) || (DEFAULT_TAX_STANDARDS as TaxStandard));
    
    // 1. 薪資所得計算 (薪資所得 = 薪資收入 - 薪資所得特別扣除額)
    const salaryUserDeduction = Math.min(record.salaryUser || 0, std.salaryDeductionUnit);
    const salaryUserAfterDeduction = (record.salaryUser || 0) - salaryUserDeduction;
    const salarySpouseDeduction = record.isMarried ? Math.min(record.salarySpouse || 0, std.salaryDeductionUnit) : 0;
    const salarySpouseAfterDeduction = record.isMarried ? (record.salarySpouse || 0) - salarySpouseDeduction : 0;

    // 2. 總所得 (薪資所得 + 營利所得 + 利息所得 + 其他所得)
    const totalIncome = salaryUserAfterDeduction + salarySpouseAfterDeduction + (record.profitIncome || 0) + (record.interestIncome || 0) + (record.otherIncome || 0);

    // 3. 免稅額
    const totalExemptions = (record.exemptionsCount || 0) * std.exemptionBase + (record.exemptionsSeniorCount || 0) * std.exemptionSenior;

    // 4. 扣除額 (標準 vs 列舉)
    const standardDeduction = record.isMarried ? std.standardDeductionMarried : std.standardDeductionSingle;
    const generalDeduction = Math.max(standardDeduction, record.itemizedDeduction || 0);
    const isItemized = (record.itemizedDeduction || 0) > standardDeduction;

    // 5. 特別扣除額 (儲蓄、身障、教育、幼兒、長照)
    const savingsDeduction = Math.min(record.interestIncome || 0, std.savingsDeductionLimit);
    const disabilityTotal = (record.disabilityCount || 0) * std.disabilityDeductionUnit;
    const educationTotal = (record.educationCount || 0) * std.educationDeductionUnit;
    const preschoolTotal = (record.preschoolCount || 0) * std.preschoolDeductionUnit;
    const longTermCareTotal = (record.longTermCareCount || 0) * std.longTermCareDeductionUnit;
    const specialDeductionsTotal = savingsDeduction + disabilityTotal + educationTotal + preschoolTotal + longTermCareTotal;
    const specialDeductionsTotalPlusGeneral = specialDeductionsTotal + generalDeduction;

    // 6. 基本生活費差額
    const headcount = (record.exemptionsCount || 0) + (record.exemptionsSeniorCount || 0);
    const bleTotal = headcount * std.basicLivingExpenseUnit;
    const bleComparison = totalExemptions + generalDeduction + savingsDeduction + disabilityTotal + educationTotal + preschoolTotal + longTermCareTotal;
    const bleDifference = Math.max(0, bleTotal - bleComparison);

    // 7. 課稅所得額
    const netTaxableIncome = Math.max(0, totalIncome - totalExemptions - generalDeduction - specialDeductionsTotal - bleDifference - (record.startupInvestmentDeduction || 0));

    // 8. 應納稅額
    const bracketIndex = std.taxBrackets?.findIndex((b, i) => netTaxableIncome <= b.limit) ?? -1;
    const bracket = bracketIndex !== -1 ? std.taxBrackets[bracketIndex] : (std.taxBrackets?.[std.taxBrackets.length - 1] || { rate: 0, adjustment: 0 });
    const taxPayable = netTaxableIncome * bracket.rate - bracket.adjustment;

    // 9. 退補稅額
    const divCreditRaw = (record.profitIncome || 0) * 0.085;
    const divCredit = Math.min(divCreditRaw, 80000);
    const finalTaxDue = taxPayable - (record.investmentCredits || 0) - (record.homePurchaseCredits || 0) - (record.withholding || 0) - divCredit - (record.mainlandTaxCredits || 0);

    return {
      salaryUserDeduction: Math.round(salaryUserDeduction), 
      salaryUserAfterDeduction: Math.round(salaryUserAfterDeduction), 
      salarySpouseDeduction: Math.round(salarySpouseDeduction), 
      salarySpouseAfterDeduction: Math.round(salarySpouseAfterDeduction),
      totalIncome: Math.round(totalIncome), 
      totalExemptions: Math.round(totalExemptions), 
      generalDeduction: Math.round(generalDeduction), 
      standardDeduction: Math.round(standardDeduction), 
      isItemized,
      savingsDeduction: Math.round(savingsDeduction),
      specialDeductionsTotal: Math.round(specialDeductionsTotal),
      specialDeductionsTotalPlusGeneral: Math.round(specialDeductionsTotalPlusGeneral),
      headcount,
      bleComparison: Math.round(bleComparison),
      bleDifference: Math.round(bleDifference),
      netTaxableIncome: Math.round(netTaxableIncome),
      bracket,
      taxPayable: Math.round(taxPayable),
      divCreditRaw: Math.round(divCreditRaw),
      divCredit: Math.round(divCredit),
      finalTaxDue: Math.round(finalTaxDue)
    };
  };

  const currentResult = calculateResult(newTax);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">所得稅管理</h2>
          <p className="text-sm text-slate-500">預測與分析年度所得稅負</p>
        </div>
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setViewMode('records')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'records' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>紀錄</button>
          <button onClick={() => setViewMode('calculator')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'calculator' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>計算器</button>
          <button onClick={() => setViewMode('standards')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'standards' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>參數設定</button>
        </div>
      </div>

      {viewMode === 'standards' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-lg">年度稅務參數</h3>
            <div className="flex gap-3">
              <button 
                onClick={async () => {
                  if(!confirm('確定要載入 110-115 年度的預設稅務參數嗎？')) return;
                  try {
                    for (const preset of PRESET_TAX_STANDARDS) {
                      // Check if already exists
                      const existing = standards.find(s => s.year === preset.year);
                      if (!existing) {
                        const { id, ...data } = preset;
                        await addDoc(collection(db, 'taxStandards'), { ...data, uid: user.uid });
                      }
                    }
                    alert('預設參數載入完成！');
                  } catch (err) {
                    alert('載入失敗，請確認網路連線。');
                  }
                }}
                className="text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-all flex items-center gap-2"
              >
                <Save size={16} /> 載入 110-115 預設參數
              </button>
              <label className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-all font-bold text-sm">
                <Sparkles size={16} /> {isAnalyzingStandard ? '辨識中...' : 'AI 辨識參數'}
                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleStandardUpload} disabled={isAnalyzingStandard} />
              </label>
              <button onClick={() => { setNewStandard({...DEFAULT_TAX_STANDARDS, year: 113}); setIsAddingStandard(true); }} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl">新增年度參數</button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {standards.map(std => (
              <div key={std.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <span className="text-2xl font-black text-slate-800">{std.year}年</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setNewStandard(std); setIsAddingStandard(true); }} className="p-2 text-slate-400 hover:text-indigo-600">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDeleteStandard(std.id, std.year)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="刪除年度參數">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest mb-1">一般免稅額</p>
                    <p className="font-bold text-slate-700">${std.exemptionBase.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest mb-1">標準扣除(單)</p>
                    <p className="font-bold text-slate-700">${std.standardDeductionSingle.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
            {standards.length === 0 && <p className="text-slate-400 text-sm">目前使用系統預設參數 (112年度)。</p>}
          </div>

          <AnimatePresence>
            {isAddingStandard && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-8">
                   <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-black text-slate-800">編輯年度參數</h3>
                    <button onClick={() => setIsAddingStandard(false)} className="p-2 hover:bg-slate-50 rounded-full"><X /></button>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">年度 (民國)</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.year} onChange={e => setNewStandard({...newStandard, year: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">一般免稅額</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.exemptionBase} onChange={e => setNewStandard({...newStandard, exemptionBase: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">免稅額 (70歲+)</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.exemptionSenior} onChange={e => setNewStandard({...newStandard, exemptionSenior: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">標扣 (單身)</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.standardDeductionSingle} onChange={e => setNewStandard({...newStandard, standardDeductionSingle: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">標扣 (有配偶)</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.standardDeductionMarried} onChange={e => setNewStandard({...newStandard, standardDeductionMarried: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">薪資扣除額</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.salaryDeductionUnit} onChange={e => setNewStandard({...newStandard, salaryDeductionUnit: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">儲蓄扣除額上限</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.savingsDeductionLimit} onChange={e => setNewStandard({...newStandard, savingsDeductionLimit: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">基本生活費</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.basicLivingExpenseUnit} onChange={e => setNewStandard({...newStandard, basicLivingExpenseUnit: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">身障特扣</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.disabilityDeductionUnit} onChange={e => setNewStandard({...newStandard, disabilityDeductionUnit: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">教育學費特扣</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.educationDeductionUnit} onChange={e => setNewStandard({...newStandard, educationDeductionUnit: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">幼兒學前特扣</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.preschoolDeductionUnit} onChange={e => setNewStandard({...newStandard, preschoolDeductionUnit: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">長期照顧特扣</label>
                       <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newStandard.longTermCareDeductionUnit} onChange={e => setNewStandard({...newStandard, longTermCareDeductionUnit: Number(e.target.value)})} />
                     </div>
                   </div>

                   <div className="mt-8 space-y-4">
                     <div className="flex justify-between items-center">
                       <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                         <CreditCardIcon size={18} className="text-indigo-600" />
                         課稅級距設定
                       </h4>
                       <button 
                         onClick={() => setNewStandard({
                           ...newStandard, 
                           taxBrackets: [...(newStandard.taxBrackets || []), { limit: 0, rate: 0, adjustment: 0 }]
                         })}
                         className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
                       >
                         + 新增級距
                       </button>
                     </div>
                     <div className="overflow-x-auto">
                       <table className="w-full text-left border-collapse">
                         <thead>
                           <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                             <th className="pb-3 px-2">淨所得上限 (含)</th>
                             <th className="pb-3 px-2">稅率 (0~1)</th>
                             <th className="pb-3 px-2">累進差額</th>
                             <th className="pb-3 px-2 w-10"></th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                           {newStandard.taxBrackets?.map((bracket, bIdx) => (
                             <tr key={bIdx} className="group">
                               <td className="py-2 px-2">
                                 <input 
                                   type="number" 
                                   className="w-full p-2 bg-slate-50 border rounded-lg text-sm" 
                                   value={bracket.limit === Infinity ? 999999999 : bracket.limit} 
                                   onChange={e => {
                                      const brackets = [...(newStandard.taxBrackets || [])];
                                      brackets[bIdx].limit = Number(e.target.value) >= 999999999 ? Infinity : Number(e.target.value);
                                      setNewStandard({...newStandard, taxBrackets: brackets});
                                   }} 
                                   placeholder="上限"
                                 />
                               </td>
                               <td className="py-2 px-2">
                                 <input 
                                   type="number" 
                                   step="0.01"
                                   className="w-full p-2 bg-slate-50 border rounded-lg text-sm" 
                                   value={bracket.rate} 
                                   onChange={e => {
                                      const brackets = [...(newStandard.taxBrackets || [])];
                                      brackets[bIdx].rate = Number(e.target.value);
                                      setNewStandard({...newStandard, taxBrackets: brackets});
                                   }} 
                                 />
                               </td>
                               <td className="py-2 px-2">
                                 <input 
                                   type="number" 
                                   className="w-full p-2 bg-slate-50 border rounded-lg text-sm" 
                                   value={bracket.adjustment} 
                                   onChange={e => {
                                      const brackets = [...(newStandard.taxBrackets || [])];
                                      brackets[bIdx].adjustment = Number(e.target.value);
                                      setNewStandard({...newStandard, taxBrackets: brackets});
                                   }} 
                                 />
                               </td>
                               <td className="py-2 px-2">
                                 <button 
                                   onClick={() => {
                                     const brackets = [...(newStandard.taxBrackets || [])];
                                     brackets.splice(bIdx, 1);
                                     setNewStandard({...newStandard, taxBrackets: brackets});
                                   }}
                                   className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                 >
                                   <Trash2 size={16} />
                                 </button>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>

                   <div className="mt-8 flex justify-end gap-3 pt-6 border-t font-medium">
                     <button onClick={() => setIsAddingStandard(false)} className="px-6 py-2 text-slate-500 hover:bg-slate-50 rounded-xl transition-all">取消</button>
                     <button onClick={handleSaveStandard} className="px-8 py-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">儲存參數</button>
                   </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}
      {viewMode === 'records' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-lg">申報歷史紀錄</h3>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl text-xs font-bold text-slate-500">
                <span>辨識年度:</span>
                <select 
                  className="bg-transparent border-none p-0 focus:ring-0 text-indigo-600"
                  value={aiScanYear}
                  onChange={e => setAiScanYear(Number(e.target.value))}
                >
                  {[115, 114, 113, 112, 111, 110].map(y => <option key={y} value={y}>{y}年度</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-all font-bold text-sm">
                <Sparkles size={16} /> {isAnalyzing ? '分析中...' : 'AI 辨識匯入'}
                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleAIUpload} disabled={isAnalyzing} />
              </label>
              <button 
                onClick={() => { 
                  setNewTax({...INITIAL_TAX_RECORD, year: aiScanYear, parameterYear: aiScanYear}); 
                  setIsAdding(true); 
                  setViewMode('calculator'); 
                }} 
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 font-bold text-sm"
              >
                <Calculator size={16} /> 開啟計算器
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {taxes.map(tax => {
              const res = calculateResult(tax);
              return (
                <div key={tax.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-all overflow-hidden">
                  <div 
                    className="flex-1 p-6 flex items-center gap-6 cursor-pointer hover:bg-slate-50 transition-colors" 
                    onClick={() => { setNewTax(tax); setIsAdding(true); setViewMode('calculator'); }}
                  >
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black text-lg group-hover:bg-indigo-100 transition-colors">
                      {tax.year}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{tax.year} 年度申報 (選用{tax.parameterYear || tax.year}參數)</p>
                      <p className="text-xs text-slate-400">總所得: ${res.totalIncome.toLocaleString()} / 課稅所得: ${res.netTaxableIncome.toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8 pr-6">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">應補(退)稅額</p>
                      <p className={`text-xl font-black ${res.finalTaxDue > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {res.finalTaxDue > 0 ? '+' : ''}${Math.round(res.finalTaxDue).toLocaleString()}
                      </p>
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => handleDeleteTax(tax.id, String(tax.year), e)} 
                      className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      title="刪除紀錄"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              );
            })}
            {taxes.length === 0 && <p className="text-center py-20 text-slate-400 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100">尚無申報紀錄，請點擊上方按鈕開始計算或匯入。</p>}
          </div>
        </div>
      )}

      {(viewMode === 'calculator' || isAdding) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-800">稅務試算表</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4 text-sm font-bold text-slate-500">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={newTax.isMarried} onChange={e => setNewTax({...newTax, isMarried: e.target.checked})} className="w-4 h-4 rounded text-indigo-600" />
                      <span>合併申報</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">所得年度</span>
                    <select className="bg-slate-50 p-2 rounded-xl text-xs font-bold" value={newTax.year} onChange={e => setNewTax({...newTax, year: Number(e.target.value)})}>
                      {[115, 114, 113, 112, 111, 110].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">選用參數</span>
                    <select className="bg-slate-50 p-2 rounded-xl text-xs font-bold ring-2 ring-indigo-500/20" value={newTax.parameterYear} onChange={e => setNewTax({...newTax, parameterYear: Number(e.target.value)})}>
                      {[115, 114, 113, 112, 111, 110].map(y => <option key={y} value={y}>{y}年度參數</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <section className="space-y-4">
                  <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">所得來源 (年收入)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">本人薪資總額</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.salaryUser} onChange={e => setNewTax({...newTax, salaryUser: Number(e.target.value)})} />
                    </div>
                    {newTax.isMarried && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400">配偶薪資總額</label>
                        <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.salarySpouse} onChange={e => setNewTax({...newTax, salarySpouse: Number(e.target.value)})} />
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">營利所得 (含股利 54C)</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.profitIncome} onChange={e => setNewTax({...newTax, profitIncome: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">利息所得 (金融機構)</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.interestIncome} onChange={e => setNewTax({...newTax, interestIncome: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">其他所得 (租賃/執業/中獎等)</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.otherIncome} onChange={e => setNewTax({...newTax, otherIncome: Number(e.target.value)})} />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">免稅額與撫養</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">一般免稅人數 (含本人/配偶/70歲以下)</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.exemptionsCount} onChange={e => setNewTax({...newTax, exemptionsCount: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">70歲以上扶養人數</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.exemptionsSeniorCount} onChange={e => setNewTax({...newTax, exemptionsSeniorCount: Number(e.target.value)})} />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">特別扣除與扺減</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">身障人數</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl text-center" value={newTax.disabilityCount} onChange={e => setNewTax({...newTax, disabilityCount: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">幼兒人數</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl text-center" value={newTax.preschoolCount} onChange={e => setNewTax({...newTax, preschoolCount: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">教育人數</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl text-center" value={newTax.educationCount} onChange={e => setNewTax({...newTax, educationCount: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">長照人數</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl text-center" value={newTax.longTermCareCount} onChange={e => setNewTax({...newTax, longTermCareCount: Number(e.target.value)})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">列舉扣除額 (如保險、醫療、捐贈等)</label>
                      <div className="relative">
                        <input type="number" className={`w-full p-3 bg-slate-50 border rounded-xl ${currentResult.isItemized ? 'border-emerald-500 ring-2 ring-emerald-100' : ''}`} value={newTax.itemizedDeduction} onChange={e => setNewTax({...newTax, itemizedDeduction: Number(e.target.value)})} />
                        {currentResult.isItemized && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm">已採用</span>}
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1">
                        系統將自動比對標扣 (${currentResult.standardDeduction.toLocaleString()})，並套用較高者。
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">扣繳稅額 (各項收入已扣)</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.withholding} onChange={e => setNewTax({...newTax, withholding: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400">備註</label>
                      <input type="text" className="w-full p-3 bg-slate-50 border rounded-xl" value={newTax.note} onChange={e => setNewTax({...newTax, note: e.target.value})} placeholder="例如：112年度申報結果" />
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-indigo-600 p-8 rounded-3xl shadow-xl shadow-indigo-200 text-white space-y-6">
              <div>
                <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">預估應補 (退) 稅額</p>
                <h3 className="text-4xl font-black">
                  {currentResult.finalTaxDue > 0 ? '+' : ''}${Math.round(currentResult.finalTaxDue).toLocaleString()}
                </h3>
                <p className="mt-2 text-xs text-indigo-200 font-medium opacity-80">
                  {currentResult.finalTaxDue < 0 ? '恭喜！您預計可獲得稅務退還。' : '請預留稅款以備申報期繳納。'}
                </p>
              </div>

              <div className="space-y-3 pt-6 border-t border-indigo-500/50">
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">綜合所得總額</span>
                  <span className="font-bold">${Math.round(currentResult.totalIncome).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">免稅+扣除額合計</span>
                  <span className="font-bold">-${Math.round(currentResult.totalExemptions + currentResult.generalDeduction + currentResult.specialDeductionsTotal + currentResult.bleDifference).toLocaleString()}</span>
                </div>
                {currentResult.isItemized && (
                  <div className="flex justify-between text-[10px] italic -mt-2">
                    <span className="text-emerald-300 ml-4">採用列舉扣除額模式</span>
                    <span className="text-emerald-300 font-bold">✓</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">所得課稅額</span>
                  <span className="font-bold font-mono">${Math.round(currentResult.netTaxableIncome).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-2 pt-2 border-t border-indigo-500/30">
                  <span>應納稅額</span>
                  <span>${Math.round(currentResult.taxPayable).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm italic">
                  <span className="text-indigo-200">股利抵減額</span>
                  <span className="text-emerald-300">-${Math.round(currentResult.divCredit).toLocaleString()}</span>
                </div>
                 <div className="flex justify-between text-sm italic">
                  <span className="text-indigo-200">已扣繳稅額</span>
                  <span className="text-emerald-300">-${Math.round(newTax.withholding || 0).toLocaleString()}</span>
                </div>
              </div>

              <button 
                onClick={handleSaveTax}
                className="w-full py-4 bg-white text-indigo-600 font-black rounded-2xl shadow-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <Save size={20} /> 儲存計算結果
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 text-xs text-slate-500 leading-relaxed space-y-4">
              <h4 className="font-bold text-slate-700 flex items-center gap-2 underline">
                <Info size={14} /> 稅務大綱
              </h4>
              <p>計算大綱：<br/><b>1. 所得總額</b> = (薪資-扣除) + 股利 + 利息<br/><b>2. 淨所得</b> = 所得總額 - 免稅額 - 標扣 - 特扣 - 基本生活費差額<br/><b>3. 應納稅額</b> = (淨所得 × 稅率) - 累進差額<br/><b>4. 退補稅額</b> = 應納稅額 - 投資扺減 - 扣繳額 - 股利抵減(8.5%)</p>
              <p className="text-[10px] text-amber-600 font-medium">※ 以上為試算結果，請以國稅局正式申報收執聯為準。</p>
            </div>
          </div>
        </div>
      )}

      {(viewMode === 'calculator' || isAdding) && (
        <div className="mt-8">
           <CalculationBreakdown 
             tax={newTax} 
             result={currentResult} 
             std={standards.find(s => s.year === newTax.year) || (DEFAULT_TAX_STANDARDS as TaxStandard)} 
           />
        </div>
      )}
    </div>
  );
};

const BudgetPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newBudget, setNewBudget] = useState<Partial<Budget>>({ category: '', allocated: 0, spent: 0, year: new Date().getFullYear() });

  useEffect(() => {
    const targetUids = getAppTargetUids(user);
    const q = query(collection(db, 'budgets'), where('uid', 'in', targetUids));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Budget));
      setBudgets(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'budgets');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handleAdd = async () => {
    try {
      const budget = { ...newBudget, uid: user.uid };
      await addDoc(collection(db, 'budgets'), budget);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'budgets');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeleteTarget({ type: 'budgets', id, name });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">年度支出預算</h2>
        <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={20} /> 新增預算項目
        </button>
      </div>

      {isAdding && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="類別 (如: 旅遊, 保險)" className="p-2 border rounded-md" value={newBudget.category} onChange={e => setNewBudget({...newBudget, category: e.target.value})} />
            <input type="number" placeholder="預算金額" className="p-2 border rounded-md" value={newBudget.allocated} onChange={e => setNewBudget({...newBudget, allocated: Number(e.target.value)})} />
            <input type="number" placeholder="已支出" className="p-2 border rounded-md" value={newBudget.spent} onChange={e => setNewBudget({...newBudget, spent: Number(e.target.value)})} />
            <input type="number" placeholder="年份" className="p-2 border rounded-md" value={newBudget.year} onChange={e => setNewBudget({...newBudget, year: Number(e.target.value)})} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
            <button onClick={handleAdd} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">儲存</button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {budgets.map(budget => {
          const remaining = budget.allocated - budget.spent;
          const percent = (budget.spent / budget.allocated) * 100;
          return (
            <div key={budget.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 group relative">
              <button onClick={() => handleDelete(budget.id, budget.category)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={18} />
              </button>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{budget.year} 預算</p>
                  <h3 className="text-xl font-bold text-slate-800">{budget.category}</h3>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">剩餘</p>
                  <p className={`text-lg font-bold ${remaining >= 0 ? 'text-slate-800' : 'text-rose-500'}`}>
                    ${remaining.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${percent > 90 ? 'bg-rose-500' : percent > 70 ? 'bg-amber-500' : 'bg-indigo-500'}`} 
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-500">已支出: ${budget.spent.toLocaleString()}</span>
                  <span className="text-slate-500">預算: ${budget.allocated.toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const GenericPage = ({ title, icon: Icon, type }: { title: string, icon: any, type: string }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Icon size={28} className="text-indigo-600" />
          {title}
        </h2>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={20} /> 新增項目
        </button>
      </div>
      <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center space-y-4">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
          <Icon size={32} className="text-slate-300" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-slate-700">{title} 功能開發中</h3>
          <p className="text-slate-500">這裡將會顯示您的{title}詳細資訊與管理介面。</p>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('tax');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [user, setUser] = useState<any>({ uid: 'default-user', email: 'guest@example.com' });
  const [loading, setLoading] = useState(true);

  // Global Summary States
  const [summary, setSummary] = useState({ banks: 0, stocks: 0, funds: 0, debt: 0, loans: 0, stockBreakdown: { total: 0, firstrade: 0, cathay: 0 } });
  const [deleteTarget, setDeleteTarget] = useState<{ type: string, id: string, name: string } | null>(null);

  // Custom Modal Component
  const ConfirmationModal = ({ isOpen, onClose, onConfirm, message }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, message: string }) => {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
          <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">確認刪除</h3>
          <p className="text-slate-600 mb-6">{message}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">取消</button>
            <button 
              onClick={async () => {
                await onConfirm();
                onClose();
              }} 
              className="flex-1 py-3 px-4 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 active:scale-95 transition-transform"
            >
              確認刪除
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Data Migration from LocalStorage to Firestore
  useEffect(() => {
    if (loading) return;
    
    const migrateData = async () => {
      const keys = ['salaryRecords', 'bankAccounts', 'creditCards', 'stocks', 'funds', 'budgets', 'yearlyStandards', 'taxes', 'taxStandards'];
      const currentUid = user.uid;
      
      for (const key of keys) {
        const localData = localStorage.getItem(key);
        if (localData) {
          try {
            const items = JSON.parse(localData);
            if (Array.isArray(items) && items.length > 0) {
              console.log(`Migrating ${items.length} items from localStorage for ${key}`);
              const collectionRef = collection(db, key);
              for (const item of items) {
                // Check if already exists by some heuristic or just push if not too many
                // For simplicity in this environment, we'll push with a special flag
                const { id, ...data } = item;
                await addDoc(collectionRef, { ...data, uid: currentUid, _migratedFromLocal: true });
              }
              // Clear local storage after successful migration to avoid duplicates
              localStorage.removeItem(key);
            }
          } catch (e) {
            console.error(`Failed to migrate ${key}:`, e);
          }
        }
      }
    };
    
    migrateData();
  }, [user.uid, loading]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        setUser(authUser);
      } else {
        setUser({ uid: 'default-user', email: 'guest@example.com' });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const targetUids = getAppTargetUids(user);
    
    const unsubBanks = onSnapshot(query(collection(db, 'bankAccounts'), where('uid', 'in', targetUids)), s => {
      const data = s.docs.map(d => d.data());
      const assets = data.filter(d => d.type !== 'loan').reduce((acc, d) => acc + (d.balance || 0), 0);
      const loans = data.filter(d => d.type === 'loan').reduce((acc, d) => acc + (d.balance || d.loanRemaining || 0), 0);
      setSummary(prev => ({ ...prev, banks: assets, loans: loans }));
    });
    const unsubStocks = onSnapshot(query(collection(db, 'stocks'), where('uid', 'in', targetUids)), s => {
      setSummary(prev => {
        const stocks = s.docs.reduce((acc, d) => {
          const val = (d.data().shares * d.data().currentPrice || 0);
          const isUsd = d.data().source === 'Firstrade';
          const convVal = isUsd ? val * 32.5 : val;
          return {
            ...acc,
            total: acc.total + convVal,
            firstrade: acc.firstrade + (isUsd ? convVal : 0),
            cathay: acc.cathay + (d.data().source === 'Cathay' ? convVal : 0)
          };
        }, { total: 0, firstrade: 0, cathay: 0 });
        return { ...prev, stocks: stocks.total, stockBreakdown: stocks };
      });
    });
    const unsubFunds = onSnapshot(query(collection(db, 'funds'), where('uid', 'in', targetUids)), s => {
      setSummary(prev => ({ ...prev, funds: s.docs.reduce((acc, d) => acc + (d.data().currentValue || 0), 0) }));
    });
    const unsubDebt = onSnapshot(query(collection(db, 'creditCards'), where('uid', 'in', targetUids)), s => {
      setSummary(prev => ({ ...prev, debt: s.docs.reduce((acc, d) => acc + (d.data().currentBalance || 0), 0) }));
    });
    
    return () => {
      unsubBanks(); unsubStocks(); unsubFunds(); unsubDebt();
    };
  }, [user?.uid]);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  const migrateData = async () => {
    if (!window.confirm('確定要將 jason2134@gmail.com 的資料匯入至目前帳號嗎？')) return;
    
    setIsMigrating(true);
    let totalMigrated = 0;
    const collectionsToMigrate = [
      'salaryRecords', 'creditCards', 'bankAccounts', 'funds', 
      'stocks', 'budgets', 'yearlyStandards', 'taxes', 'taxStandards'
    ];
    
    try {
      for (const colName of collectionsToMigrate) {
        const q = query(collection(db, colName), where('uid', '==', 'jason2134@gmail.com'));
        const snapshot = await getDocs(q);
        
        for (const d of snapshot.docs) {
          await updateDoc(doc(db, colName, d.id), { uid: user.uid });
          totalMigrated++;
        }
      }
      alert(`遷移完成！共移動了 ${totalMigrated} 筆資料至目前帳號（${user.email || '訪客'}）。`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'migration');
    } finally {
      setIsMigrating(false);
    }
  };

  const saveApiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKeyInput);
    setIsApiKeyModalOpen(false);
    alert('API Key 已儲存');
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.warn('Login popup closed by user.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.warn('Login request cancelled.');
      } else {
        console.error('Login Error:', error);
        alert(`登入發生失敗：${error.message}`);
      }
    }
  };

  const renderContent = () => {
    if (!user) return null;
    const pageProps = { user, setDeleteTarget };
    switch (activeTab) {
      case 'dashboard': return <DashboardPage user={user} summary={summary} />;
      case 'salary': return <SalaryPage {...pageProps} />;
      case 'credit-cards': return <CreditCardPage {...pageProps} />;
      case 'banks': return <BankPage {...pageProps} />;
      case 'stocks': return <StockPage {...pageProps} />;
      case 'budget': return <BudgetPage {...pageProps} />;
      case 'tax': return <TaxPage {...pageProps} />;
      default: return <DashboardPage user={user} summary={summary} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden relative">
        {/* Mobile Toggle (only visible when sidebar is closed on small screens if we wanted, but let's stick to desktop focus) */}
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="fixed top-4 left-4 z-50 p-3 bg-white border border-slate-200 rounded-xl shadow-xl text-indigo-600 hover:bg-slate-50 transition-all active:scale-95"
            title="開啟功能選單"
          >
            <PanelLeftOpen size={24} />
          </button>
        )}

        {/* Sidebar */}
        <motion.aside 
          initial={false}
          animate={{ 
            width: isSidebarOpen ? (window.innerWidth < 768 ? '100%' : '256px') : '0px',
            padding: isSidebarOpen ? '24px' : '0px',
            opacity: isSidebarOpen ? 1 : 0
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="bg-white border-r border-slate-200 flex flex-col gap-8 flex-shrink-0 overflow-hidden relative"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 flex-shrink-0">
                <Calculator size={24} />
              </div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight whitespace-nowrap">
                財務管理<br/><span className="text-indigo-600">系統</span>
              </h1>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0"
              title="隱藏側邊欄"
            >
              <PanelLeftClose size={20} />
            </button>
          </div>

          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 space-y-3 min-w-[200px]">
              <div>
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">目前淨資產</p>
                <p className="text-xl font-black text-indigo-700">${Math.round(summary.banks + summary.stocks + summary.funds - (summary.debt + summary.loans)).toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <p className="text-slate-400 font-bold">存款/投資</p>
                  <p className="font-bold text-emerald-600">${Math.round(summary.banks + summary.stocks + summary.funds).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold">總負債</p>
                  <p className="text-rose-500 font-bold">${Math.round(summary.debt + summary.loans).toLocaleString()}</p>
                </div>
              </div>
            </div>
          
          <nav className="flex flex-col gap-1 overflow-y-auto">
            {TABS.map((tab) => {
              const Icon = {
                LayoutDashboard,
                Wallet,
                CreditCard: CreditCardIcon,
                Building2,
                TrendingUp,
                BarChart3,
                PieChart,
                FileText
              }[tab.icon as string];

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    activeTab === tab.id 
                      ? 'bg-indigo-50 text-indigo-600 font-semibold shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  {Icon && <Icon size={20} />}
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 min-w-[200px]">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">目前身份</p>
              <div className="flex items-center justify-between gap-2 overflow-hidden">
                <p className="text-sm font-semibold text-slate-700 truncate">{user.email || '訪客'}</p>
                {user.email !== 'guest@example.com' ? (
                  <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-rose-500 transition-colors" title="登出">
                    <LogOut size={16} />
                  </button>
                ) : (
                  <button onClick={handleLogin} className="text-indigo-600 hover:text-indigo-700 transition-colors" title="登入">
                    <LogIn size={16} />
                  </button>
                )}
              </div>
              {user.email === 'guest@example.com' && (
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                  ※ 登入失敗？請點擊右上的「在新分頁中開啟」
                </p>
              )}
            </div>
            <button 
              onClick={() => setIsApiKeyModalOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all font-medium"
            >
              <Settings size={20} />
              設定 API Key
            </button>
            <button 
              onClick={migrateData}
              disabled={isMigrating}
              className="w-full flex items-center gap-3 px-4 py-3 text-amber-600 hover:bg-amber-50 rounded-xl transition-all font-medium disabled:opacity-50"
            >
              {isMigrating ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
              匯入舊帳號資料
            </button>
          </div>
        </motion.aside>

        {/* API Key Modal */}
        {isApiKeyModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-lg font-bold">設定 Gemini API Key</h3>
              <input 
                type="password" 
                value={apiKeyInput} 
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="輸入 API Key"
                className="w-full p-2 border rounded-lg"
              />
              <div className="flex gap-2">
                <button onClick={() => setIsApiKeyModalOpen(false)} className="flex-1 p-2 text-slate-600">取消</button>
                <button onClick={saveApiKey} className="flex-1 p-2 bg-indigo-600 text-white rounded-lg">儲存</button>
              </div>
            </div>
          </div>
        )}
        <ConfirmationModal 
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (deleteTarget) {
              try {
                await deleteDoc(doc(db, deleteTarget.type, deleteTarget.id));
                window.alert('紀錄已刪除');
              } catch (err) {
                handleFirestoreError(err, OperationType.DELETE, deleteTarget.type);
              }
            }
          }}
          message={`確定要永久刪除此紀錄嗎？\n(${deleteTarget?.name || '未命名'})`}
        />

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto bg-slate-50 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </ErrorBoundary>
  );
}
