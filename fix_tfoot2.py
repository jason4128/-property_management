import sys

with open("src/App.tsx", "r") as f:
    content = f.read()

old_tfoot = """          {sectionItems.length > 0 && (
            <tfoot className="bg-slate-50/80 font-bold border-t-2 border-slate-200">
               <tr>
                 <td colSpan={3} className="p-4 text-right text-slate-500">合計年度總預算:</td>
                 <td className="p-4 text-right text-indigo-700 text-lg">${Math.floor(stats.yearlyEquivalentTotal).toLocaleString()}</td>
                 <td className="p-4 text-right text-slate-700">${Math.floor(stats.totalSpent).toLocaleString()}</td>
                 <td colSpan={2} />
               </tr>
            </tfoot>
          )}
        </table>
            </div>
          );
        })}
      </div>"""

new_tfoot = """          {sectionItems.length > 0 && (() => {
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
            </tfoot>
            );
          })()}
        </table>
            </div>
          );
        })}
      </div>"""

content = content.replace(old_tfoot, new_tfoot)

with open("src/App.tsx", "w") as f:
    f.write(content)
