import sys

with open("src/App.tsx", "r") as f:
    content = f.read()

old_stats_block = """    const annualSurplus = totalHouseholdIncome - totalExpenses;
    const monthlySurplus = annualSurplus / 12;

    const yearlyTotal = yearlyItems.reduce((sum, b) => sum + b.allocated, 0);
    const monthlyTotal = monthlyItems.reduce((sum, b) => sum + b.allocated, 0);
    const yearlyEquivalentTotal = yearlyTotal + (monthlyTotal * 12);
    
    const totalSpent = currentYearBudgets.reduce((sum, b) => {
      if (b.frequency === 'monthly') return sum + (b.spent * 12); 
      return sum + b.spent;
    }, 0);"""

new_stats_block = """    const annualSurplus = totalHouseholdIncome - totalExpenses;
    const monthlySurplus = annualSurplus / 12;

    // Only count actual expenses for these global totals
    const expenseItems = currentYearBudgets.filter(b => b.belonging !== 'income' && b.belonging !== 'subsidy');
    const yearlyExpenseItems = expenseItems.filter(b => b.frequency !== 'monthly');
    const monthlyExpenseItems = expenseItems.filter(b => b.frequency === 'monthly');

    const yearlyTotal = yearlyExpenseItems.reduce((sum, b) => sum + b.allocated, 0);
    const monthlyTotal = monthlyExpenseItems.reduce((sum, b) => sum + b.allocated, 0);
    const yearlyEquivalentTotal = yearlyTotal + (monthlyTotal * 12);
    
    const totalSpent = expenseItems.reduce((sum, b) => {
      if (b.frequency === 'monthly') return sum + (b.spent * 12); 
      return sum + b.spent;
    }, 0);"""

content = content.replace(old_stats_block, new_stats_block)

with open("src/App.tsx", "w") as f:
    f.write(content)
