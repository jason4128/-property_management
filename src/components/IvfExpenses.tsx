import React, { useState, useEffect, useRef } from 'react';
import { collection, query, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, Trash2, Scan, Loader2, Image as ImageIcon } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

interface IvfRecord {
  id: string;
  uid: string;
  date: string;
  item: string;
  amount: number;
}

const getAppTargetUidsLocal = (user: any) => {
  return [
    'default-user', 
    'local_default_user', 
    'guest-user', 
    'guest', 
    'anonymous', 
    'local_user', 
    'jason2134@gmail.com', 
    user?.uid
  ].filter(Boolean);
};

export default function IvfExpenses({ user, setDeleteTarget }: { user: any, setDeleteTarget?: (t: any) => void }) {
  const [records, setRecords] = useState<IvfRecord[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const targetUids = getAppTargetUidsLocal(user);
    const q = query(collection(db, 'ivfExpenses'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as IvfRecord))
        .filter(r => user.email === 'guest@example.com' || !r.uid || targetUids.includes(r.uid))
        .sort((a, b) => b.date.localeCompare(a.date));
      setRecords(data);
    });
    return () => unsub();
  }, [user]);

  const totalAmount = records.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const handleManualAdd = async () => {
    if (!date || !item || !amount) return;
    try {
      await addDoc(collection(db, 'ivfExpenses'), {
        uid: user.uid,
        date,
        item,
        amount: Number(amount)
      });
      setItem('');
      setAmount('');
    } catch (error) {
      console.error('Error adding record:', error);
      alert('新增失敗');
    }
  };

  const handleDelete = async (id: string) => {
    if (setDeleteTarget) {
      setDeleteTarget({ type: 'ivfExpenses', id, name: '此筆試管費用' });
    } else {
      if (confirm('確定要刪除這筆紀錄嗎？')) {
        await deleteDoc(doc(db, 'ivfExpenses', id));
      }
    }
  };

  const processFile = async (file: File) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      alert("請在設定中設定 Gemini API Key");
      return;
    }

    setIsScanning(true);
    try {
      // convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `這是一張醫療費用收據（可能是試管嬰兒、醫美等）。請分析內容並萃取：
1. 日期 (date, YYYY-MM-DD 格式，如果是民國年請換算回西元年，格式必為 YYYY-MM-DD，若找不到用今天的日期)
2. 項目 (item, 如自費藥品費、掛號費、處置費等，如果是多項請用逗號分隔合併為一行，或直接列出主要項目，如果是安田婦產科診所之類的收據，請簡單總結)
3. 總金額 (amount, 數字，請找合計金額)
找不到的項目請合理推斷或填空。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: file.type || 'image/jpeg', data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              item: { type: Type.STRING },
              amount: { type: Type.NUMBER }
            },
            required: ['date', 'item', 'amount']
          }
        }
      });

      const text = response.text();
      if (text) {
        const result = JSON.parse(text);
        if (result.date) setDate(result.date);
        if (result.item) setItem(result.item);
        if (result.amount !== undefined) setAmount(result.amount);
      }
    } catch (error) {
      console.error("AI scanning error:", error);
      alert('掃描分析失敗，請確認圖片清晰並已設定有效的 API Key。');
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
          }
          break;
        }
      }
    };
    
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* 左側：統計清單 */}
        <div className="bg-slate-50/[0.3] border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div>
              <h3 className="text-xl font-bold text-slate-800">費用明細清單</h3>
              <p className="text-sm text-slate-500">目前累積試管嬰兒花費總計</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-rose-600">${totalAmount.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px]">
            {records.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <ImageIcon className="mx-auto h-12 w-12 mb-3 opacity-20" />
                <p>尚無費用紀錄</p>
              </div>
            ) : (
              records.map(record => (
                <div key={record.id} className="group flex justify-between items-center p-4 bg-white rounded-xl shadow-sm border border-slate-100/50 hover:shadow-md transition-shadow">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-bold text-slate-700 truncate">{record.item}</span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{record.date}</div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-black text-lg text-rose-600">${record.amount.toLocaleString()}</span>
                    <button 
                      onClick={() => handleDelete(record.id)}
                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右側：新增表單與掃描 */}
        <div className="bg-white border text-slate-700 border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          <div className="bg-indigo-50/50 rounded-xl p-5 border border-indigo-100 border-dashed text-center">
            <h4 className="font-bold text-indigo-900 mb-2">AI 收據掃描器</h4>
            <p className="text-sm text-indigo-700/70 mb-4">上傳醫療費用收據，自動帶入日期、項目及金額</p>
            
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="inline-flex w-full justify-center items-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-70"
            >
              {isScanning ? (
                <><Loader2 className="animate-spin" size={20} /> 分析收據中...</>
              ) : (
                <><Scan size={20} /> 掃描上傳收據</>
              )}
            </button>
            <p className="text-[11px] text-indigo-400 mt-2 font-medium">支援截圖後直接使用 Ctrl+V / Cmd+V 貼上圖片</p>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 border-b pb-2">手動新增/編輯</h4>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">日期</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">收費項目說明</label>
                <input 
                  type="text" 
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="例如：門診費、取卵手術、凍卵等"
                  className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">總金額</label>
                <input 
                  type="number" 
                  value={amount === '' ? '' : amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0"
                  className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono"
                />
              </div>
            </div>

            <button 
              onClick={handleManualAdd}
              disabled={!item || amount === '' || typeof amount !== 'number'}
              className="w-full mt-4 bg-slate-900 text-white font-bold py-3 px-4 rounded-xl hover:bg-slate-800 transition-colors disabled:bg-slate-300 flex justify-center items-center gap-2"
            >
              <Plus size={18} /> 新增此筆紀錄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
