import sys

with open("src/App.tsx", "r") as f:
    lines = f.readlines()

new_stats = """  const stats = useMemo(() => {
    const currentYearBudgets = budgets.filter(b => b.year === selectedYear);
    const yearlyItems = currentYearBudgets.filter(b => b.frequency !== 'monthly');
    const monthlyItems = currentYearBudgets.filter(b => b.frequency === 'monthly');
    
    // Income
    const yearStr = selectedYear.toString();
    const currentYearSalaries = salaries.filter(s => s.date.startsWith(yearStr));
    let totalSalaryIncome = 0;
    if (currentYearSalaries.length > 0) {
      totalSalaryIncome = currentYearSalaries.reduce((sum, r) => {
        const income = (r.basicPay || 0) + (r.professionalAllowance || 0) + (r.medicalIncentive || 0) + (r.overtimePay || 0) + (r.yearEndBonus || 0) + (r.performanceBonus || 0) + (r.otherIncome || 0);
        const deduction = (r.civilServiceInsurance || 0) + (r.healthInsurance || 0) + (r.pensionFund || 0) + (r.otherDeduction || 0) + (r.withholdingTax || 0);
        return sum + (income - deduction);
      }, 0);
    } else if (salaries.length > 0) {
      const latest = [...salaries].sort((a,b) => b.date.localeCompare(a.date))[0];
      const income = (latest.basicPay || 0) + (latest.professionalAllowance || 0) + (latest.medicalIncentive || 0) + (latest.overtimePay || 0) + (latest.yearEndBonus || 0) + (latest.performanceBonus || 0) + (latest.otherIncome || 0);
      const deduction = (latest.civilServiceInsurance || 0) + (latest.healthInsurance || 0) + (latest.pensionFund || 0) + (latest.otherDeduction || 0);
      totalSalaryIncome = (income - deduction) * 12;
    }

    const otherIncomes = currentYearBudgets.filter(b => b.belonging === 'income' || b.belonging === 'subsidy');
    const totalOtherIncome = otherIncomes.reduce((sum, b) => {
      return sum + (b.frequency === 'monthly' ? (b.allocated * 12) : b.allocated);
    }, 0);
    
    const totalHouseholdIncome = totalSalaryIncome + totalOtherIncome;

    // Expenses by category
    const calculateTotal = (category) => {
      return currentYearBudgets.filter(b => b.belonging === category).reduce((sum, b) => {
        return sum + (b.frequency === 'monthly' ? (b.allocated * 12) : b.allocated);
      }, 0);
    };

    const myExpensesTotal = calculateTotal('my');
    const wifeExpensesTotal = calculateTotal('wife');
    const jointExpensesTotal = calculateTotal('joint');
    
    // Childcare net
    const childcareGross = calculateTotal('childcare');
    const childcareSubsidies = currentYearBudgets.filter(b => b.belonging === 'subsidy').reduce((sum, b) => {
      return sum + (b.frequency === 'monthly' ? (b.allocated * 12) : b.allocated);
    }, 0);
    const totalChildcareNetExpense = Math.max(0, childcareGross - childcareSubsidies);

    const totalExpenses = myExpensesTotal + wifeExpensesTotal + jointExpensesTotal + childcareGross;
    const annualSurplus = totalHouseholdIncome - totalExpenses;
    const monthlySurplus = annualSurplus / 12;

    const yearlyTotal = yearlyItems.reduce((sum, b) => sum + b.allocated, 0);
    const monthlyTotal = monthlyItems.reduce((sum, b) => sum + b.allocated, 0);
    const yearlyEquivalentTotal = yearlyTotal + (monthlyTotal * 12);
    
    const totalSpent = currentYearBudgets.reduce((sum, b) => {
      if (b.frequency === 'monthly') return sum + (b.spent * 12); 
      return sum + b.spent;
    }, 0);
    const avgMonthlyIncome = totalHouseholdIncome / 12;
    const monthlyExpense = (yearlyTotal / 12) + monthlyTotal;
    const canSave = avgMonthlyIncome - monthlyExpense;

    return {
      yearlyTotal,
      monthlyTotal,
      yearlyEquivalentTotal,
      totalSpent,
      remaining: yearlyEquivalentTotal - totalSpent,
      avgMonthlyIncome,
      monthlyExpense,
      canSave,
      totalHouseholdIncome,
      myExpensesTotal,
      wifeExpensesTotal,
      jointExpensesTotal,
      totalChildcareNetExpense,
      totalExpenses,
      annualSurplus,
      monthlySurplus
    };
  }, [budgets, salaries, selectedYear]);
"""

lines[8688:8732] = [new_stats]

with open("src/App.tsx", "w") as f:
    f.writelines(lines)
