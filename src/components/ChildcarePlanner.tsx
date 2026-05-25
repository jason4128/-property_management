import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Baby, Calendar, Minus, Plus, Settings2, TrendingDown, TrendingUp, AlertCircle, Coins, HeartPulse, GraduationCap, School, ChevronDown, ChevronUp, Save, Check } from 'lucide-react';
import { onSnapshot, collection, query, where, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, SalaryRecord, Stock } from '../types';

interface StageConfig {
  id: string;
  name: string;
  durationMonths: number;
  wifeIncomeRatio: number; // 0 to 1 (e.g., 0.8 during leave, 1.0 normal, 0 if unemployed)
  careType: 'self' | 'public_daycare' | 'quasi_nanny' | 'private_nanny' | 'public_preschool' | 'non_profit_preschool' | 'quasi_preschool' | 'private_preschool';
  extraMonthlyCost: number; // Diapers, formula, etc.
}

const CARE_OPTIONS = [
  { value: 'self', label: '自行照顧 (長輩/全職)', type: '0-6' },
  { value: 'public_daycare', label: '公設民營托嬰中心', type: '0-2' },
  { value: 'quasi_nanny', label: '準公共保母/托嬰', type: '0-2' },
  { value: 'private_nanny', label: '私人保母/托嬰', type: '0-2' },
  { value: 'public_preschool', label: '公立幼兒園', type: '2-6' },
  { value: 'non_profit_preschool', label: '非營利幼兒園', type: '2-6' },
  { value: 'quasi_preschool', label: '準公共幼兒園', type: '2-6' },
  { value: 'private_preschool', label: '私立幼兒園', type: '2-6' },
];

const DEFAULT_STAGES: StageConfig[] = [
  { id: '1', name: '育嬰留職停薪 (前6月)', durationMonths: 6, wifeIncomeRatio: 0.8, careType: 'self', extraMonthlyCost: 6000 },
  { id: '2', name: '托嬰階段 (保母/公托)', durationMonths: 18, wifeIncomeRatio: 1.0, careType: 'quasi_nanny', extraMonthlyCost: 8000 },
  { id: '3', name: '幼兒園小班~大班', durationMonths: 48, wifeIncomeRatio: 1.0, careType: 'quasi_preschool', extraMonthlyCost: 5000 },
];

export const ChildcarePlanner = ({ 
  user, 
  userAvgMonthlyIncome, 
  userMonthlyExpense 
}: { 
  user: User, 
  userAvgMonthlyIncome: number,
  userMonthlyExpense: number
}) => {
  const [stages, setStages] = useState<StageConfig[]>(DEFAULT_STAGES);

  // Dynamic values
  const [wifeIncome, setWifeIncome] = useState(45800);
  const [monthlyDividend, setMonthlyDividend] = useState(0);
  const [wifeBaseExpenses, setWifeBaseExpenses] = useState(25000); // Editable now
  const [isStructureOpen, setIsStructureOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveExpenses = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      localStorage.setItem('wifeBaseExpenses', String(wifeBaseExpenses));
      const configDocId = user?.uid || 'default-user';
      await setDoc(doc(db, 'userConfigs', configDocId), { wifeBaseExpenses: Number(wifeBaseExpenses) }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Error saving wife base expenses:", err);
      alert("儲存失敗");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const getAppTargetUidsLocal = (u: any) => {
      return [
        'default-user', 
        'local_default_user', 
        'guest-user', 
        'guest', 
        u?.uid
      ].filter(Boolean);
    };

    const targetUids = getAppTargetUidsLocal(user);

    // Fetch wife salary
    const qWife = query(collection(db, 'wifeSalaries'));
    const unsubWife = onSnapshot(qWife, (snapshot) => {
      const allWife = snapshot.docs.map(doc => doc.data() as any);
      const records = allWife.filter(r => user?.email === 'guest@example.com' || !r.uid || targetUids.includes(r.uid));
      if (records.length > 0) {
        const latest = records.sort((a,b) => b.date.localeCompare(a.date))[0];
        // For wife, the fields are actualSalary, bonus, otherDeductions, healthIns, laborIns, laborPension
        const income = Number(latest.actualSalary || latest.baseSalary || 0) + Number(latest.bonus || 0);
        const deduction = Number(latest.laborIns || 0) + Number(latest.healthIns || 0) + Number(latest.laborPension || 0) + Number(latest.otherDeductions || 0);
        setWifeIncome(income - deduction);
      }
    });

    // Fetch stocks (and possibly funds if they have expected dividend, but rely on stocks for now)
    const qStocks = query(collection(db, 'stocks'));
    const unsubStocks = onSnapshot(qStocks, (snapshot) => {
      const allStocks = snapshot.docs.map(doc => doc.data() as Stock);
      const stocks = allStocks.filter(r => user?.email === 'guest@example.com' || !r.uid || targetUids.includes(r.uid));
      const totalDiv = stocks.reduce((sum, s) => {
         const isUsd = s.source === 'Firstrade';
         const expected = s.expectedDividendPerShare || 0;
         const dividend = s.shares * expected;
         const dividendTWD = isUsd ? dividend * 32 : dividend; // assuming usdRate = 32
         return sum + dividendTWD;
      }, 0);
      setMonthlyDividend(Math.floor(totalDiv / 12));
    });

    // Fetch wife base expenses from userConfigs
    const configDocId = user?.uid || 'default-user';
    const unsubConfigs = onSnapshot(doc(db, 'userConfigs', configDocId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().wifeBaseExpenses !== undefined) {
        setWifeBaseExpenses(Number(docSnap.data().wifeBaseExpenses));
      } else {
        const saved = localStorage.getItem('wifeBaseExpenses');
        if (saved) setWifeBaseExpenses(Number(saved));
      }
    });

    return () => {
      unsubWife();
      unsubStocks();
      unsubConfigs();
    };
  }, [user]);

  const baseHouseholdIncome = userAvgMonthlyIncome + wifeIncome + monthlyDividend;
  const totalBaseExpenses = userMonthlyExpense + wifeBaseExpenses;

  const getSubsidyAndCost = (careType: string) => {
    switch (careType) {
      case 'self': return { cost: 0, subsidy: 5000, label: '育兒津貼' };
      case 'public_daycare': return { cost: 12000, subsidy: 7000, label: '公托補助' };
      case 'quasi_nanny': return { cost: 19000, subsidy: 13000, label: '準公共托育補助' };
      case 'private_nanny': return { cost: 22000, subsidy: 5000, label: '育兒津貼(無加碼)' };
      case 'public_preschool': return { cost: 1000, subsidy: 0, label: '就學繳費上限' };
      case 'non_profit_preschool': return { cost: 2000, subsidy: 0, label: '就學繳費上限' };
      case 'quasi_preschool': return { cost: 3000, subsidy: 0, label: '就學繳費上限' };
      case 'private_preschool': return { cost: 15000, subsidy: 5000, label: '育兒津貼' };
      default: return { cost: 0, subsidy: 0, label: '' };
    }
  };

  const addStage = () => {
    setStages([...stages, {
      id: Date.now().toString(),
      name: '新階段',
      durationMonths: 12,
      wifeIncomeRatio: 1.0,
      careType: 'self',
      extraMonthlyCost: 5000
    }]);
  };

  const removeStage = (id: string) => {
    setStages(stages.filter(s => s.id !== id));
  };

  const updateStage = (id: string, field: keyof StageConfig, value: any) => {
    setStages(stages.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const formatAgeMonths = (totalMonths: number) => {
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    if (years === 0) return `${months}個月`;
    return `${years}歲${months}個月`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Baby size={160} />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black mb-2">育兒長征：從出生到上學</h2>
          <p className="text-indigo-100 max-w-xl mb-4">
            這裡為您規劃人生最重要的甜蜜負擔。模擬不同階段的托育選擇、老婆留職停薪對家庭現金流的影響，並自動計算最新的政府補助金。
          </p>
        </div>
      </div>

      {/* Assumptions Panel */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
          <Settings2 size={18} className="text-indigo-600" /> 基礎財務設定 (每月)
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-400">目前家庭總月收</label>
            </div>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer select-none group" onClick={() => setIsStructureOpen(!isStructureOpen)}>
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold font-mono text-indigo-700">${baseHouseholdIncome.toLocaleString()}</p>
                {isStructureOpen ? <ChevronUp size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" /> : <ChevronDown size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />}
              </div>
              
              <AnimatePresence>
                {isStructureOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 mt-3 border-t border-slate-200 space-y-2 text-sm font-mono text-slate-600">
                      <div className="flex justify-between items-center">
                        <span className="font-sans text-xs">我的月薪 (來自最新薪資)</span>
                        <span>${Math.round(userAvgMonthlyIncome).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-sans text-xs">老婆月薪 (來自最新薪資)</span>
                        <span>${Math.round(wifeIncome).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-600">
                        <span className="font-sans text-xs">平均月配息 (來自股票預估)</span>
                        <span>+${Math.round(monthlyDividend).toLocaleString()}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-400">我的基本開銷 (來自年度預算)</label>
            <p className="text-xl font-bold font-mono mt-2">${Math.round(userMonthlyExpense).toLocaleString()}</p>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400">老婆基本開銷 (含個人)</label>
            <div className="flex items-center gap-2 mt-1 relative">
              <span className="text-slate-400">$</span>
              <input 
                type="number"
                value={wifeBaseExpenses}
                onChange={e => setWifeBaseExpenses(Number(e.target.value))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSaveExpenses();
                  }
                }}
                className="w-full text-xl font-bold font-mono bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none placeholder-slate-300 pr-10"
              />
              <button
                onClick={handleSaveExpenses}
                disabled={isSaving}
                className={`absolute right-0 bottom-1 p-1.5 rounded-lg transition-all ${
                  saveSuccess 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                }`}
                title={saveSuccess ? "已儲存" : "儲存開銷設定"}
              >
                {saveSuccess ? <Check size={14} /> : <Save size={14} />}
              </button>
            </div>
            {saveSuccess && (
              <p className="text-[10px] text-emerald-600 mt-1 font-semibold animate-fade-in">已成功儲存至雲端！</p>
            )}
          </div>
        </div>

        <div className="mt-6 p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-3">
          <AlertCircle size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
             <p className="font-bold">單次生育補助概算 (未計入下方逐月現金流)</p>
             <p className="mt-1">
               勞保生育給付 (2個月投保薪資)：約 <span className="font-bold text-blue-600">${(Math.min(wifeIncome, 45800) * 2).toLocaleString()}</span>，最高級距為 45,800 元<br/>
               縣市生育津貼 (以高雄首胎為例)：<span className="font-bold text-blue-600">$30,000</span>
             </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {stages.reduce((acc, stage, index) => {
          // Calculate cumulative months BEFORE this stage
          const previousMonths = acc.accumulatedMonths;
          const currentMonths = previousMonths + stage.durationMonths;
          
          let { cost, subsidy, label } = getSubsidyAndCost(stage.careType);
          
          // Calculate max allowed income for subsidy if she takes leave (capped at 45800 according to Labor Insurance rules)
          const leaveIncome = (stage.wifeIncomeRatio < 1 && stage.wifeIncomeRatio > 0) ? Math.min(wifeIncome, 45800) * stage.wifeIncomeRatio : wifeIncome * stage.wifeIncomeRatio;
          const currentHouseholdIncome = userAvgMonthlyIncome + leaveIncome + monthlyDividend;
          
          const stageNetCashflow = currentHouseholdIncome - cost + subsidy - stage.extraMonthlyCost - totalBaseExpenses;
          const normalNetCashflow = baseHouseholdIncome - totalBaseExpenses; // Without child
          const impact = stageNetCashflow - normalNetCashflow;

          acc.elements.push(
            <motion.div 
              key={stage.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black shrink-0">
                    {index + 1}
                  </div>
                  <div>
                    <input 
                      type="text" 
                      value={stage.name}
                      onChange={(e) => updateStage(stage.id, 'name', e.target.value)}
                      className="font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none truncate max-w-[200px] md:max-w-none"
                    />
                    <div className="text-xs text-indigo-500 font-bold mt-1">
                      小孩歲數: {formatAgeMonths(previousMonths)} ~ {formatAgeMonths(currentMonths)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 border-l border-slate-200 pl-4">
                  <select 
                    value={stage.durationMonths}
                    onChange={(e) => updateStage(stage.id, 'durationMonths', Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-lg p-1.5 text-sm font-bold text-slate-700"
                  >
                    {[3,6,12,18,24,36,48].map(m => (
                      <option key={m} value={m}>為期 {m} 個月</option>
                    ))}
                  </select>
                  <button onClick={() => removeStage(stage.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                    <Minus size={18} />
                  </button>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-5 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                      <HeartPulse size={14} className="text-rose-500" />
                      老婆工作狀態 (收入金額)
                    </label>
                    <select 
                      value={stage.wifeIncomeRatio}
                      onChange={e => updateStage(stage.id, 'wifeIncomeRatio', Number(e.target.value))}
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                    >
                      <option value={1}>全職上班 (100% 薪資: ${Math.round(wifeIncome).toLocaleString()})</option>
                      <option value={0.8}>育嬰留職停薪 (領8成津貼最高級距: ${Math.round(Math.min(wifeIncome, 45800) * 0.8).toLocaleString()})</option>
                      <option value={0}>無收入 (全職媽媽/津貼已結束: $0)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                      <School size={14} className="text-amber-500" />
                      主要托育方式
                    </label>
                    <select 
                      value={stage.careType}
                      onChange={e => updateStage(stage.id, 'careType', e.target.value)}
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                    >
                      {CARE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500">預估每月嬰幼兒雜支 (奶粉/尿布/耗材)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-slate-500">$</span>
                      <input 
                        type="number"
                        value={stage.extraMonthlyCost}
                        onChange={e => updateStage(stage.id, 'extraMonthlyCost', Number(e.target.value))}
                        className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Cashflow Display */}
                <div className="md:col-span-7 bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col justify-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">本階段每月家庭現金流變化</h4>
                  
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>家庭總月收 (含配息+老婆津貼/薪資)</span>
                      <span className="font-bold">${Math.round(currentHouseholdIncome).toLocaleString()}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-slate-600 group relative">
                      <span className="flex items-center gap-1">
                        托育花費 <span className="text-[10px] bg-slate-200 px-1 py-0.5 rounded ml-1 font-sans">自填估計</span>
                      </span>
                      <span className="text-rose-500">-${cost.toLocaleString()}</span>
                    </div>

                    {subsidy > 0 && (
                      <div className="flex justify-between items-center text-emerald-600 bg-emerald-50 p-1 -mx-1 rounded">
                        <span className="flex items-center gap-1">
                           政府津貼/補助 <span className="text-[10px] bg-emerald-100 px-1 py-0.5 rounded ml-1 font-sans">{label}</span>
                        </span>
                        <span>+${subsidy.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-slate-600">
                      <span>嬰兒雜支與兩人基本生活費</span>
                      <span className="text-rose-500">-${Math.round(stage.extraMonthlyCost + totalBaseExpenses).toLocaleString()}</span>
                    </div>

                    <div className="h-px bg-slate-200 my-2" />

                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-slate-500 text-xs font-sans">階段每月結餘</span>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-black ${stageNetCashflow >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                          ${Math.round(stageNetCashflow).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400 font-sans mt-0.5">
                          比起生小孩前: <span className={impact > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            {impact > 0 ? '+' : ''}{Math.round(impact).toLocaleString()}
                          </span>
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </motion.div>
          );
          
          acc.accumulatedMonths = currentMonths;
          return acc;
        }, { elements: [] as React.ReactNode[], accumulatedMonths: 0 }).elements}
      </div>

      <button onClick={addStage} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 font-bold hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
        <Plus size={20} /> 新增下一個階段
      </button>

    </div>
  );
};

