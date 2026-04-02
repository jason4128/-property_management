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
  ChevronRight,
  Calculator,
  Camera,
  Save,
  X,
  LogOut,
  LogIn,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TABS, TabId } from './constants';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { 
  SalaryRecord, 
  CreditCard, 
  BankAccount, 
  Fund, 
  Stock, 
  Budget,
  YearlyStandard
} from './types';
import { 
  BASIC_PAY_TABLE, 
  PROFESSIONAL_ALLOWANCE_TABLE, 
  calculateExpectedDeductions 
} from './salaryTable';

import { GoogleGenAI, Type } from "@google/genai";
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
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

  return JSON.parse(response.text || "[]") as Partial<SalaryRecord>[];
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

const SalaryPage = ({ user }: { user: User }) => {
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
    const q = query(collection(db, 'salaryRecords'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SalaryRecord));
      setRecords(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'salaryRecords');
    });
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    const q = query(collection(db, 'yearlyStandards'), where('uid', '==', user.uid));
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

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'salaryRecords', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'salaryRecords');
    }
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

  const handleDeleteYearlyStandard = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'yearlyStandards', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'yearlyStandards');
    }
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
                                  onClick={() => handleDeleteYearlyStandard(s.id)}
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
                        onClick={() => handleDelete(r.id)}
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

const CreditCardPage = ({ user }: { user: User }) => {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newCard, setNewCard] = useState<Partial<CreditCard>>({
    name: '', bank: '', statementDate: 1, dueDate: 1, limit: 0, currentBalance: 0
  });

  useEffect(() => {
    const q = query(collection(db, 'creditCards'), where('uid', '==', user.uid));
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

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'creditCards', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'creditCards');
    }
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
            <button onClick={() => handleDelete(card.id)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
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

const BankPage = ({ user }: { user: User }) => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<BankAccount>>({
    name: '', bankName: '', balance: 0, type: 'savings'
  });

  useEffect(() => {
    const q = query(collection(db, 'bankAccounts'), where('uid', '==', user.uid));
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
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bankAccounts');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'bankAccounts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'bankAccounts');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">銀行帳戶</h2>
        <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={20} /> 新增帳戶
        </button>
      </div>

      {isAdding && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="帳戶名稱" className="p-2 border rounded-md" value={newAccount.name} onChange={e => setNewAccount({...newAccount, name: e.target.value})} />
            <input type="text" placeholder="銀行名稱" className="p-2 border rounded-md" value={newAccount.bankName} onChange={e => setNewAccount({...newAccount, bankName: e.target.value})} />
            <input type="number" placeholder="餘額" className="p-2 border rounded-md" value={newAccount.balance} onChange={e => setNewAccount({...newAccount, balance: Number(e.target.value)})} />
            <select className="p-2 border rounded-md" value={newAccount.type} onChange={e => setNewAccount({...newAccount, type: e.target.value as any})}>
              <option value="savings">活期儲蓄</option>
              <option value="checking">支票帳戶</option>
              <option value="fixed">定期存款</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
            <button onClick={handleAdd} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">儲存</button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                <Building2 size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{acc.name}</h3>
                <p className="text-sm text-slate-500">{acc.bankName} • {acc.type === 'savings' ? '活期' : acc.type === 'fixed' ? '定存' : '支票'}</p>
              </div>
            </div>
            <div className="text-right flex items-center gap-4">
              <div>
                <p className="text-xl font-bold text-slate-800">${acc.balance.toLocaleString()}</p>
              </div>
              <button onClick={() => handleDelete(acc.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FundPage = ({ user }: { user: User }) => {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newFund, setNewFund] = useState<Partial<Fund>>({ name: '', cost: 0, currentValue: 0, units: 0 });

  useEffect(() => {
    const q = query(collection(db, 'funds'), where('uid', '==', user.uid));
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
                    <button onClick={() => handleDelete(fund.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
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

const StockPage = ({ user }: { user: User }) => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newStock, setNewStock] = useState<Partial<Stock>>({ symbol: '', name: '', shares: 0, averageCost: 0, currentPrice: 0 });

  // Filtering & Batch Delete State
  const [selectedSource, setSelectedSource] = useState<'all' | 'Cathay' | 'Firstrade'>('all');
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const [usdRate, setUsdRate] = useState(32.5); // Default rate

  // AI Recognition State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<any[] | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'stocks'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Stock));
      setStocks(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stocks');
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
      const prompt = `這是一張股票庫存明細的截圖（可能來自國泰證券或 Firstrade）。請辨識圖中的股票資訊並以 JSON 格式回傳一個陣列。
      每個物件包含：
      - symbol: 股票代號 (例如: 0050, AAPL)
      - name: 股票名稱 (例如: 元大台灣50, Apple)
      - shares: 持有股數 (數字)
      - averageCost: 平均成本 (數字)
      - currentPrice: 目前股價 (數字)
      
      請只回傳 JSON 陣列，不要有其他文字。`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: aiImage.split(',')[1]
            }
          }
        ]
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setAiResult(data);
      }
    } catch (error) {
      console.error("AI Recognition Error:", error);
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleImportAIResult = async (source: 'Cathay' | 'Firstrade' | 'FundRich') => {
    if (!aiResult) return;
    try {
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
      
      setIsAIModalOpen(false);
      setAiResult(null);
      setAiImage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stocks');
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

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'stocks', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stocks');
    }
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
          const [quoteRes, historyRes] = await Promise.all([
            fetch(`/api/stock/${selectedStock.symbol}`),
            fetch(`/api/stock/history/${selectedStock.symbol}`)
          ]);
          
          const quoteText = await quoteRes.text();
          const historyText = await historyRes.text();
          
          if (!quoteRes.ok) throw new Error(`Failed to fetch quote: ${quoteText}`);
          if (!historyRes.ok) throw new Error(`Failed to fetch history: ${historyText}`);
          
          setStockData(JSON.parse(quoteText));
          setHistoryData(JSON.parse(historyText));
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
  
  const portfolioSummary = filteredStocks.reduce((acc, s) => {
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
      const batchDelete = Array.from(selectedStocks).map(id => deleteDoc(doc(db, 'stocks', id)));
      await Promise.all(batchDelete);
      setSelectedStocks(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stocks');
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('確定要刪除所有股票資訊嗎？此操作無法復原。')) return;
    try {
      const batchDelete = stocks.map(stock => deleteDoc(doc(db, 'stocks', stock.id)));
      await Promise.all(batchDelete);
      setSelectedStocks(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stocks');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">股票投資</h2>
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
                <th className="px-4 py-3">股票/基金</th>
                <th className="px-4 py-3">來源</th>
                <th className="px-4 py-3">股數/單位</th>
                <th className="px-4 py-3">成本</th>
                <th className="px-4 py-3">市值</th>
                <th className="px-4 py-3">損益</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map(stock => {
                const isUsd = stock.source === 'Firstrade';
                const cost = stock.shares * stock.averageCost;
                const val = stock.shares * stock.currentPrice;
                const profit = val - cost;
                return (
                  <tr key={stock.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedStock(stock)}>
                    <td className="px-4 py-3 font-medium text-indigo-600 hover:underline">{stock.symbol} ({stock.name})</td>
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
              <button onClick={() => handleDelete(stock.id)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
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

const BudgetPage = ({ user }: { user: User }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newBudget, setNewBudget] = useState<Partial<Budget>>({ category: '', allocated: 0, spent: 0, year: new Date().getFullYear() });

  useEffect(() => {
    const q = query(collection(db, 'budgets'), where('uid', '==', user.uid));
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

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'budgets', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'budgets');
    }
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
              <button onClick={() => handleDelete(budget.id)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
  const [activeTab, setActiveTab] = useState<TabId>('salary');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const saveApiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKeyInput);
    setIsApiKeyModalOpen(false);
    alert('API Key 已儲存');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const renderContent = () => {
    if (!user) return null;
    switch (activeTab) {
      case 'salary': return <SalaryPage user={user} />;
      case 'credit-cards': return <CreditCardPage user={user} />;
      case 'banks': return <BankPage user={user} />;
      case 'stocks': return <StockPage user={user} />;
      case 'budget': return <BudgetPage user={user} />;
      default: return <SalaryPage user={user} />;
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-8"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-xl shadow-indigo-200">
            <Calculator size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-800">公務員財務管理</h1>
            <p className="text-slate-500">請登入以同步您的財務資料</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 py-4 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            使用 Google 帳號登入
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Calculator size={24} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">
              公務員<br/><span className="text-indigo-600">財務管理</span>
            </h1>
          </div>

          <nav className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const Icon = {
                Wallet,
                CreditCard: CreditCardIcon,
                Building2,
                TrendingUp,
                BarChart3,
                PieChart
              }[tab.icon];

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

          <div className="mt-auto space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">使用者</p>
              <p className="text-sm font-semibold text-slate-700 truncate">{user.email}</p>
            </div>
            <button 
              onClick={() => setIsApiKeyModalOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl transition-all font-medium"
            >
              <Settings size={20} />
              設定 API Key
            </button>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all font-medium"
            >
              <LogOut size={20} />
              登出
            </button>
          </div>
        </aside>

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

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
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
