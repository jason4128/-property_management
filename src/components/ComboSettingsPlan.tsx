import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Insurance } from '../types';
import { Settings, ExternalLink, RefreshCw } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const ComboSettingsPlan = ({ 
  insurances, 
  currentAge,
  onGenerate
}: { 
  insurances: Insurance[];
  currentAge: number;
  onGenerate: (insId: string) => Promise<void>;
}) => {
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleUpdate = async (id: string, field: string, val: any) => {
     try {
       await updateDoc(doc(db, 'insurances', id), { [field]: val });
     } catch(e) {
       console.error(e);
     }
  };

  const providers = Array.from(new Set(insurances.map(i => i.provider)));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {providers.map(provider => {
        const providerInsurances = insurances.filter(i => i.provider === provider);
        const totalPremium = providerInsurances.reduce((sum, ins) => sum + (ins.firstYearPremium || 0), 0);

        return (
          <div key={provider} className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm">
             <div className="bg-slate-50 border-b border-slate-100 p-4 md:px-6 flex justify-between items-center">
                 <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                   <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
                   {provider}
                 </h3>
                 <div className="flex flex-col items-end">
                   <span className="text-[10px] font-bold text-slate-400">總計首年保費</span>
                   <span className="text-lg font-black text-slate-700">${totalPremium.toLocaleString()} 元</span>
                 </div>
             </div>

             <div className="divide-y divide-slate-100 px-4 md:px-6 py-2">
                <div className="hidden md:grid grid-cols-12 gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest py-3">
                   <div className="col-span-4">保險項目</div>
                   <div className="col-span-2 text-center">繳費年期</div>
                   <div className="col-span-3 text-center">保額/計畫別</div>
                   <div className="col-span-3 text-center">首年預估保費</div>
                </div>

                {providerInsurances.map(ins => (
                  <div key={ins.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center py-4 text-sm group">
                     {/* Title */}
                     <div className="md:col-span-4 flex items-center gap-2">
                        <button className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md transition-colors shrink-0">
                          <ExternalLink size={14} />
                        </button>
                        <div>
                          <p className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors leading-tight">
                            {ins.name}
                          </p>
                          <span className="text-[10px] text-slate-400">{ins.type}</span>
                        </div>
                     </div>

                     {/* Term */}
                     <div className="md:col-span-2 flex flex-col md:items-center">
                        <label className="text-[10px] text-slate-400 font-bold mb-1 md:hidden">繳費年期</label>
                        <input 
                           type="text" 
                           className="w-full md:w-3/4 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                           placeholder="如: 20年期"
                           defaultValue={ins.planTerm || ''}
                           onBlur={(e) => handleUpdate(ins.id, 'planTerm', e.target.value)}
                        />
                     </div>

                     {/* Coverage/Plan */}
                     <div className="md:col-span-3 flex flex-col md:items-center">
                        <label className="text-[10px] text-slate-400 font-bold mb-1 md:hidden">保額 / 計畫別</label>
                        {ins.planOptions && ins.planOptions.length > 0 ? (
                           <select
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center font-medium outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                              value={ins.planCoverage || ''}
                              onChange={(e) => handleUpdate(ins.id, 'planCoverage', e.target.value)}
                           >
                              <option value="">請選擇</option>
                              {ins.planOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                           </select>
                        ) : (
                           <input 
                              type="text" 
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-center outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                              placeholder="如: 20萬"
                              defaultValue={ins.planCoverage || ''}
                              onBlur={(e) => handleUpdate(ins.id, 'planCoverage', e.target.value)}
                           />
                        )}
                     </div>

                     {/* Premium & Actions */}
                     <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-3 mt-2 md:mt-0">
                        <div className="flex flex-col text-left md:text-right">
                          <label className="text-[10px] text-slate-400 font-bold mb-1 md:hidden">首年保費</label>
                          <span className="font-mono font-bold text-slate-700">
                            {ins.firstYearPremium ? `${ins.firstYearPremium.toLocaleString()} 元` : '-'}
                          </span>
                        </div>
                        <button 
                           onClick={async () => {
                             setGeneratingId(ins.id);
                             await onGenerate(ins.id);
                             setGeneratingId(null);
                           }}
                           disabled={generatingId === ins.id || !ins.planTerm || !ins.planCoverage}
                           className="p-2 border border-slate-200 text-slate-500 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0"
                           title="重新以 AI 試算費率與額度"
                        >
                           <RefreshCw size={14} className={generatingId === ins.id ? 'animate-spin' : ''} />
                           <span className="text-xs font-bold hidden xl:inline">AI 試算</span>
                        </button>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        );
      })}
    </div>
  );
};
