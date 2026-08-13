import sys

with open("src/App.tsx", "r") as f:
    content = f.read()

# Add <option value="subsidy">育兒補助</option> to the select dropdowns.
# We'll use string replacement.

old_select1 = """              <label className="text-xs font-bold text-slate-400 uppercase">歸屬分類</label>
              <select className="w-full p-2 border rounded-md bg-white text-sm" value={newBudget.belonging ?? 'joint'} onChange={e => setNewBudget({...newBudget, belonging: e.target.value as any})}>
                <option value="joint">兩人共同</option>
                <option value="my">我的個人支出</option>
                <option value="wife">老婆個人支出</option>
                <option value="childcare">育兒支出</option>
                <option value="income">收入與補助</option>
              </select>"""

new_select1 = """              <label className="text-xs font-bold text-slate-400 uppercase">歸屬分類</label>
              <select className="w-full p-2 border rounded-md bg-white text-sm" value={newBudget.belonging ?? 'joint'} onChange={e => setNewBudget({...newBudget, belonging: e.target.value as any})}>
                <option value="joint">兩人共同</option>
                <option value="my">我的個人支出</option>
                <option value="wife">老婆個人支出</option>
                <option value="childcare">育兒支出</option>
                <option value="subsidy">育兒補助款</option>
                <option value="income">一般收入</option>
              </select>"""

content = content.replace(old_select1, new_select1)

old_select2 = """                      <select 
                        className="p-1 border border-indigo-200 rounded text-[10px] outline-none" 
                        value={editingData.belonging ?? budget.belonging ?? 'joint'}
                        onChange={e => setEditingData({...editingData, belonging: e.target.value})}
                      >
                        <option value="joint">兩人共同</option>
                        <option value="my">我的個人</option>
                        <option value="wife">老婆個人</option>
                        <option value="childcare">育兒支出</option>
                        <option value="income">其他收入/補貼</option>
                      </select>"""

new_select2 = """                      <select 
                        className="p-1 border border-indigo-200 rounded text-[10px] outline-none" 
                        value={editingData.belonging ?? budget.belonging ?? 'joint'}
                        onChange={e => setEditingData({...editingData, belonging: e.target.value})}
                      >
                        <option value="joint">兩人共同</option>
                        <option value="my">我的個人</option>
                        <option value="wife">老婆個人</option>
                        <option value="childcare">育兒支出</option>
                        <option value="subsidy">育兒補助款</option>
                        <option value="income">一般收入</option>
                      </select>"""

content = content.replace(old_select2, new_select2)


old_table_logic = """        ].filter(section => belongingFilter === 'all' || belongingFilter === section.id).map(section => {
          const sectionItems = filteredBudgets.filter(b => {
             const itemBelonging = b.belonging || 'joint';
             if (section.id === 'income') return itemBelonging === 'income' || itemBelonging === 'subsidy';
             return itemBelonging === section.id;
          });"""

new_table_logic = """        ].filter(section => belongingFilter === 'all' || belongingFilter === section.id).map(section => {
          const sectionItems = filteredBudgets.filter(b => {
             const itemBelonging = b.belonging || 'joint';
             if (section.id === 'income') return itemBelonging === 'income';
             if (section.id === 'childcare') return itemBelonging === 'childcare' || itemBelonging === 'subsidy';
             return itemBelonging === section.id;
          });"""

content = content.replace(old_table_logic, new_table_logic)


old_tfoot = """          {sectionItems.length > 0 && (() => {
            const secYearlyTotal = sectionItems.filter(b => b.frequency !== 'monthly').reduce((sum, b) => sum + b.allocated, 0);
            const secMonthlyTotal = sectionItems.filter(b => b.frequency === 'monthly').reduce((sum, b) => sum + b.allocated, 0);
            const secYearlyEquivalentTotal = secYearlyTotal + (secMonthlyTotal * 12);
            const secTotalSpent = sectionItems.reduce((sum, b) => sum + (b.frequency === 'monthly' ? (b.spent * 12) : b.spent), 0);
            return (
              <tfoot className="bg-slate-50/80 font-bold border-t-2 border-slate-200">
               <tr>
                 <td colSpan={3} className="p-4 text-right text-slate-500">小計 (年度等值):</td>
                 <td className="p-4 text-right font-bold text-slate-900">${Math.floor(secYearlyTotal + secMonthlyTotal).toLocaleString()}</td>
                 <td className="p-4 text-right text-indigo-700 text-lg">${Math.floor(secYearlyEquivalentTotal).toLocaleString()}</td>
                 <td className="p-4 text-right text-slate-700">${Math.floor(secTotalSpent).toLocaleString()}</td>
                 <td colSpan={2} />
               </tr>
            </tfoot>"""

new_tfoot = """          {sectionItems.length > 0 && (() => {
            const getVal = (b: any) => (section.id === 'childcare' && b.belonging === 'subsidy') ? -b.allocated : b.allocated;
            const getSpent = (b: any) => (section.id === 'childcare' && b.belonging === 'subsidy') ? -b.spent : b.spent;

            const secYearlyTotal = sectionItems.filter(b => b.frequency !== 'monthly').reduce((sum, b) => sum + getVal(b), 0);
            const secMonthlyTotal = sectionItems.filter(b => b.frequency === 'monthly').reduce((sum, b) => sum + getVal(b), 0);
            const secYearlyEquivalentTotal = secYearlyTotal + (secMonthlyTotal * 12);
            const secTotalSpent = sectionItems.reduce((sum, b) => sum + (b.frequency === 'monthly' ? (getSpent(b) * 12) : getSpent(b)), 0);
            return (
              <tfoot className="bg-slate-50/80 font-bold border-t-2 border-slate-200">
               <tr>
                 <td colSpan={3} className="p-4 text-right text-slate-500">
                   {section.id === 'childcare' ? '淨支出小計 (扣除補助):' : '小計 (年度等值):'}
                 </td>
                 <td className="p-4 text-right font-bold text-slate-900">${Math.floor(secYearlyTotal + secMonthlyTotal).toLocaleString()}</td>
                 <td className="p-4 text-right text-indigo-700 text-lg">${Math.floor(secYearlyEquivalentTotal).toLocaleString()}</td>
                 <td className="p-4 text-right text-slate-700">${Math.floor(secTotalSpent).toLocaleString()}</td>
                 <td colSpan={2} />
               </tr>
            </tfoot>"""

content = content.replace(old_tfoot, new_tfoot)

old_badge = """                    ) : (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        (budget.belonging || 'joint') === 'my' ? 'bg-sky-50 text-sky-600' :
                        (budget.belonging || 'joint') === 'wife' ? 'bg-rose-50 text-rose-600' :
                        (budget.belonging || 'joint') === 'childcare' ? 'bg-amber-50 text-amber-600' :
                        ((budget.belonging || 'joint') === 'income' || budget.belonging === 'subsidy') ? 'bg-emerald-50 text-emerald-600' :
                        'bg-indigo-50 text-indigo-600'
                      }`}>
                        {
                          (budget.belonging || 'joint') === 'my' ? '我的個人' :
                          (budget.belonging || 'joint') === 'wife' ? '老婆個人' :
                          (budget.belonging || 'joint') === 'childcare' ? '育兒支出' :
                          ((budget.belonging || 'joint') === 'income' || budget.belonging === 'subsidy') ? '收入與補助' :
                          '兩人共同'
                        }
                      </span>
                    )}"""

new_badge = """                    ) : (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        (budget.belonging || 'joint') === 'my' ? 'bg-sky-50 text-sky-600' :
                        (budget.belonging || 'joint') === 'wife' ? 'bg-rose-50 text-rose-600' :
                        (budget.belonging || 'joint') === 'childcare' ? 'bg-amber-50 text-amber-600' :
                        (budget.belonging === 'subsidy') ? 'bg-emerald-50 text-emerald-600' :
                        ((budget.belonging || 'joint') === 'income') ? 'bg-emerald-50 text-emerald-600' :
                        'bg-indigo-50 text-indigo-600'
                      }`}>
                        {
                          (budget.belonging || 'joint') === 'my' ? '我的個人' :
                          (budget.belonging || 'joint') === 'wife' ? '老婆個人' :
                          (budget.belonging || 'joint') === 'childcare' ? '育兒支出' :
                          (budget.belonging === 'subsidy') ? '育兒補助' :
                          ((budget.belonging || 'joint') === 'income') ? '一般收入' :
                          '兩人共同'
                        }
                      </span>
                    )}"""

content = content.replace(old_badge, new_badge)

with open("src/App.tsx", "w") as f:
    f.write(content)
