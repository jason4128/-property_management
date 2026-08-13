import sys
import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# 1. Fix fetch for wife salaries
fetch_target = """    const cUnsubscribe = onSnapshot(collection(db, 'childRecords'), (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as ChildRecord))
        .filter(r => user?.email === 'guest@example.com' || !r.uid || targetUids.includes(r.uid));
      setChildRecords(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'childRecords');
    });
    return () => {
      bUnsubscribe();
      sUnsubscribe();
      cUnsubscribe();
    };"""

fetch_replacement = """    const cUnsubscribe = onSnapshot(collection(db, 'childRecords'), (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as ChildRecord))
        .filter(r => user?.email === 'guest@example.com' || !r.uid || targetUids.includes(r.uid));
      setChildRecords(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'childRecords');
    });
    const wUnsubscribe = onSnapshot(collection(db, 'wifeSalaries'), (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as any))
        .filter(r => user?.email === 'guest@example.com' || !r.uid || targetUids.includes(r.uid));
      setWifeSalaries(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'wifeSalaries');
    });
    return () => {
      bUnsubscribe();
      sUnsubscribe();
      cUnsubscribe();
      wUnsubscribe();
    };"""

if fetch_target in content:
    content = content.replace(fetch_target, fetch_replacement)
else:
    print("Fetch target not found, using regex...")
    # fallback regex
    import re
    content = re.sub(
        r"(const cUnsubscribe = onSnapshot.*?setChildRecords\(data\);.*?\}\);)\s*return \(\) => \{\s*bUnsubscribe\(\);\s*sUnsubscribe\(\);\s*cUnsubscribe\(\);\s*\};",
        r"\1\n    const wUnsubscribe = onSnapshot(collection(db, 'wifeSalaries'), (snapshot) => {\n      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any)).filter(r => user?.email === 'guest@example.com' || !r.uid || targetUids.includes(r.uid));\n      setWifeSalaries(data);\n    }, (error) => handleFirestoreError(error, OperationType.LIST, 'wifeSalaries'));\n    return () => { bUnsubscribe(); sUnsubscribe(); cUnsubscribe(); wUnsubscribe(); };",
        content,
        flags=re.DOTALL
    )

# 2. Fix the wife salary calculation logic
calc_old = """    const currentYearWifeSalaries = wifeSalaries.filter(s => s.date.startsWith(yearStr));
    let totalWifeSalaryIncome = 0;
    if (currentYearWifeSalaries.length > 0) {
      if (currentYearWifeSalaries.length === 1) {
        totalWifeSalaryIncome = (currentYearWifeSalaries[0].netAmount || 0) * 13;
      } else {
        totalWifeSalaryIncome = currentYearWifeSalaries.reduce((sum, r) => sum + (r.netAmount || 0), 0);
      }
    } else if (wifeSalaries.length > 0) {
      const latestWife = [...wifeSalaries].sort((a,b) => b.date.localeCompare(a.date))[0];
      totalWifeSalaryIncome = (latestWife.netAmount || 0) * 13;
    }"""

calc_new = """    const currentYearWifeSalaries = wifeSalaries.filter(s => s.date.startsWith(yearStr));
    let totalWifeSalaryIncome = 0;
    if (currentYearWifeSalaries.length > 0) {
      const sum = currentYearWifeSalaries.reduce((acc, r) => acc + (r.netAmount || 0), 0);
      const avg = sum / currentYearWifeSalaries.length;
      totalWifeSalaryIncome = avg * 13; // 平均月實領 * 13
    } else if (wifeSalaries.length > 0) {
      const latestWife = [...wifeSalaries].sort((a,b) => b.date.localeCompare(a.date))[0];
      totalWifeSalaryIncome = (latestWife.netAmount || 0) * 13;
    }"""

if calc_old in content:
    content = content.replace(calc_old, calc_new)
else:
    print("Calc logic not found")

# 3. Fix the dropdown options in Add Budget form
dropdown_old = """              <label className="text-xs font-bold text-slate-400 uppercase">歸屬分類</label>
              <select className="w-full p-2 border rounded-md bg-white text-sm" value={newBudget.belonging ?? 'joint'} onChange={e => setNewBudget({...newBudget, belonging: e.target.value})}>
                <option value="joint">兩人共同</option>
                <option value="my">我的個人</option>
                <option value="wife">老婆個人</option>
                <option value="childcare">育兒支出</option>
                <option value="income">其他收入/補貼</option>
              </select>"""

dropdown_new = """              <label className="text-xs font-bold text-slate-400 uppercase">歸屬分類</label>
              <select className="w-full p-2 border rounded-md bg-white text-sm" value={newBudget.belonging ?? 'joint'} onChange={e => setNewBudget({...newBudget, belonging: e.target.value})}>
                <option value="joint">兩人共同</option>
                <option value="my">我的個人</option>
                <option value="wife">老婆個人</option>
                <option value="childcare">育兒支出</option>
                <option value="subsidy">育兒補助款</option>
                <option value="income">一般收入</option>
              </select>"""

if dropdown_old in content:
    content = content.replace(dropdown_old, dropdown_new)
else:
    print("Dropdown old not found")
    # try regex for dropdown
    content = re.sub(
        r"(<select className=\"w-full p-2 border rounded-md bg-white text-sm\" value=\{newBudget\.belonging \?\? 'joint'\} onChange=\{e => setNewBudget\(\{\.\.\.newBudget, belonging: e\.target\.value\}\)\}>\s*<option value=\"joint\">兩人共同</option>\s*<option value=\"my\">我的個人</option>\s*<option value=\"wife\">老婆個人</option>\s*<option value=\"childcare\">育兒支出</option>\s*)<option value=\"income\">其他收入/補貼</option>",
        r"\1<option value=\"subsidy\">育兒補助款</option>\n                <option value=\"income\">一般收入</option>",
        content
    )

with open("src/App.tsx", "w") as f:
    f.write(content)

