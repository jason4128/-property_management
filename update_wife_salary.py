import sys

with open("src/App.tsx", "r") as f:
    content = f.read()

# 1. State Declaration
state_decl_old = """const BudgetPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);"""

state_decl_new = """const BudgetPage = ({ user, setDeleteTarget }: { user: User, setDeleteTarget: (target: any) => void }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [wifeSalaries, setWifeSalaries] = useState<any[]>([]);"""

content = content.replace(state_decl_old, state_decl_new)


# 2. Fetching & 3. Cleanup
fetch_old = """    const cUnsubscribe = onSnapshot(collection(db, 'childRecords'), (snapshot) => {
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

fetch_new = """    const cUnsubscribe = onSnapshot(collection(db, 'childRecords'), (snapshot) => {
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

content = content.replace(fetch_old, fetch_new)

# 4. Computation
computation_old = """    const otherIncomes = currentYearBudgets.filter(b => b.belonging === 'income' || b.belonging === 'subsidy');
    const totalOtherIncome = otherIncomes.reduce((sum, b) => {
      return sum + (b.frequency === 'monthly' ? (b.allocated * 12) : b.allocated);
    }, 0);
    
    const totalHouseholdIncome = totalSalaryIncome + totalOtherIncome;"""

computation_new = """    const otherIncomes = currentYearBudgets.filter(b => b.belonging === 'income' || b.belonging === 'subsidy');
    const totalOtherIncome = otherIncomes.reduce((sum, b) => {
      return sum + (b.frequency === 'monthly' ? (b.allocated * 12) : b.allocated);
    }, 0);
    
    const currentYearWifeSalaries = wifeSalaries.filter(s => s.date.startsWith(yearStr));
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
    }

    const totalHouseholdIncome = totalSalaryIncome + totalWifeSalaryIncome + totalOtherIncome;"""

content = content.replace(computation_old, computation_new)

# 5. Dependency Array
dep_old = """    };
  }, [budgets, salaries, selectedYear]);"""

dep_new = """    };
  }, [budgets, salaries, wifeSalaries, selectedYear]);"""

content = content.replace(dep_old, dep_new)

with open("src/App.tsx", "w") as f:
    f.write(content)
