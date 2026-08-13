import sys

with open("src/App.tsx", "r") as f:
    content = f.read()

# Define the sections and the replacement logic
old_code = """      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest pl-10">項目</th>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">歸屬</th>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">頻率</th>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">預算金額</th>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right whitespace-nowrap">換算每年</th>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">已支出</th>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">狀態</th>
              <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">操作</th>
            </tr>
          </thead>
          <Reorder.Group 
            as="tbody" 
            axis="y" 
            values={filteredBudgets} 
            onReorder={handleReorder}
            className="divide-y divide-slate-100"
          >
            {filteredBudgets.map(budget => {"""

new_code = """      <div className="space-y-6">
        {[
          { id: 'income', label: '收入與補助', color: 'bg-emerald-50 text-emerald-700', badgeColor: 'bg-emerald-100 text-emerald-700' },
          { id: 'my', label: '我的個人支出', color: 'bg-sky-50 text-sky-700', badgeColor: 'bg-sky-100 text-sky-700' },
          { id: 'wife', label: '老婆個人支出', color: 'bg-rose-50 text-rose-700', badgeColor: 'bg-rose-100 text-rose-700' },
          { id: 'joint', label: '兩人共同支出', color: 'bg-indigo-50 text-indigo-700', badgeColor: 'bg-indigo-100 text-indigo-700' },
          { id: 'childcare', label: '育兒支出', color: 'bg-amber-50 text-amber-700', badgeColor: 'bg-amber-100 text-amber-700' }
        ].filter(section => belongingFilter === 'all' || belongingFilter === section.id).map(section => {
          const sectionItems = filteredBudgets.filter(b => {
             const itemBelonging = b.belonging || 'joint';
             if (section.id === 'income') return itemBelonging === 'income' || itemBelonging === 'subsidy';
             return itemBelonging === section.id;
          });
          
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className={`px-4 py-3 font-bold text-sm ${section.color} border-b border-slate-200 flex items-center gap-2`}>
                {section.label}
                <span className={`text-xs px-2 py-0.5 rounded-full bg-white/50`}>{sectionItems.length}</span>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest pl-10">項目</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">歸屬</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">頻率</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">預算金額</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right whitespace-nowrap">換算每年</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">已支出</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">狀態</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">操作</th>
                  </tr>
                </thead>
                <Reorder.Group 
                  as="tbody" 
                  axis="y" 
                  values={sectionItems} 
                  onReorder={handleReorder}
                  className="divide-y divide-slate-100"
                >
                  {sectionItems.map(budget => {"""

content = content.replace(old_code, new_code)

badge_old = """                    ) : (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600`}>
                        {
                          budget.belonging === 'my' ? '我的個人' :
                          budget.belonging === 'wife' ? '老婆個人' :
                          budget.belonging === 'childcare' ? '育兒支出' :
                          budget.belonging === 'income' ? '收入補貼' :
                          '兩人共同'
                        }
                      </span>
                    )}"""

badge_new = """                    ) : (
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

content = content.replace(badge_old, badge_new)

closing_old = """                      <button onClick={() => handleDelete(budget.id, budget.category)} className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
          {filteredBudgets.length > 0 && (
            <tfoot className="bg-slate-50/80 border-t-2 border-slate-200">"""

closing_new = """                      <button onClick={() => handleDelete(budget.id, budget.category)} className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
          {sectionItems.length > 0 && (
            <tfoot className="bg-slate-50/80 border-t-2 border-slate-200">"""

content = content.replace(closing_old, closing_new)

tfoot_closing_old = """              <td colSpan={2} className="p-4 text-center"></td>
            </tr>
          </tfoot>
          )}
        </table>
      </div>"""

tfoot_closing_new = """              <td colSpan={2} className="p-4 text-center"></td>
            </tr>
          </tfoot>
          )}
        </table>
            </div>
          );
        })}
      </div>"""

content = content.replace(tfoot_closing_old, tfoot_closing_new)

# Let's fix the totals per section!
# In the tfoot, it currently uses `stats` which is global. We need to calculate for `sectionItems`!
# Let's rewrite the tfoot block entirely.

with open("src/App.tsx", "w") as f:
    f.write(content)
