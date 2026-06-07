import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Insurance } from '../types';

export const PremiumTrendOverview = ({ insurances, currentAge }: { insurances: Insurance[], currentAge: number }) => {
  const { chartData, activeInsurances } = useMemo(() => {
    const allAges = new Set<number>();
    
    const parsedTrends = insurances.map(ins => {
      let trend: {age: number, premium: number}[] = [];
      if (ins.premiumTrendJSON) {
        try {
          trend = JSON.parse(ins.premiumTrendJSON);
        } catch (e) {}
      } 
      
      if (trend.length === 0) {
          let val = 0;
          if (ins.planCalculatedPremium) {
             const parsedVal = Number(String(ins.planCalculatedPremium).replace(/[^0-9]/g, ''));
             if (!isNaN(parsedVal)) val = parsedVal;
          }
          for (let a = currentAge; a <= currentAge + 20; a++) {
             trend.push({ age: a, premium: val });
          }
      }
      return { ins, trend };
    });

    const activeInsurances = parsedTrends.filter(pt => pt.trend.length > 0);
    activeInsurances.forEach(pt => pt.trend.forEach(t => allAges.add(t.age)));

    const sortedAges = Array.from(allAges).sort((a,b) => a - b);
    
    const chartData = sortedAges.map(age => {
      const row: any = { age, displayAge: `${age} 歲` };
      let total = 0;
      activeInsurances.forEach(pt => {
        const item = pt.trend.find(t => t.age === age);
        const prem = item ? item.premium : 0;
        row[pt.ins.name] = prem;
        total += prem;
      });
      row['年繳總保費'] = total;
      return row;
    });

    return { chartData, activeInsurances };
  }, [insurances, currentAge]);

  if (chartData.length === 0) {
     return <div className="p-10 text-center text-slate-400">目前沒有可供分析的費率走勢 (請利用 AI 試算各項產品的保費)</div>;
  }

  const colors = ['#f43f5e', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white border text-center p-6 md:p-10 rounded-[2rem] shadow-sm">
        <h3 className="text-xl font-bold text-slate-800 mb-6 text-left border-l-4 border-amber-500 pl-4">保費走勢</h3>
        <div className="h-[400px] w-full">
           <ResponsiveContainer width="100%" height="100%">
             <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
               <XAxis dataKey="displayAge" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
               <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
               <Tooltip 
                 contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                 formatter={(v: number, name: string) => [`${v.toLocaleString()} 元`, name]}
               />
               <Legend wrapperStyle={{ paddingTop: '20px' }} />
               <Line type="monotone" dataKey="年繳總保費" stroke="#f59e0b" strokeWidth={4} dot={{r: 4, fill: '#f59e0b'}} activeDot={{ r: 6 }} />
               {activeInsurances.map((pt, idx) => (
                 <Line 
                   key={pt.ins.id} 
                   type="monotone" 
                   dataKey={pt.ins.name} 
                   stroke={colors[idx % colors.length]} 
                   strokeWidth={2} 
                   dot={{r: 3, fill: colors[idx % colors.length]}} 
                   activeDot={{ r: 5 }} 
                 />
               ))}
             </LineChart>
           </ResponsiveContainer>
        </div>

        <div className="mt-12 overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left bg-white whitespace-nowrap min-w-[800px]">
             <thead>
               <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
                 <th className="p-4 font-bold text-center">保險項目</th>
                 {chartData.map(d => <th key={d.age} className="p-4 font-bold text-center">{d.displayAge}</th>)}
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-50 text-sm">
               <tr className="bg-amber-50/30">
                 <td className="p-4 font-black text-amber-600 border-r border-amber-100/50">年繳總保費</td>
                 {chartData.map(d => <td key={d.age} className="p-4 font-bold text-center text-amber-700">{d['年繳總保費']?.toLocaleString()} 元</td>)}
               </tr>
               {activeInsurances.map((pt, idx) => (
                 <tr key={pt.ins.id} className="hover:bg-slate-50 transition-colors">
                   <td className="p-4 font-bold text-slate-700 border-r border-slate-100 flex items-center gap-2">
                     <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></div>
                     {pt.ins.name}
                   </td>
                   {chartData.map(d => <td key={d.age} className="p-4 text-center text-slate-500">{d[pt.ins.name]?.toLocaleString()} 元</td>)}
                 </tr>
               ))}
             </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
