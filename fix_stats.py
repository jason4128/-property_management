import sys

with open("src/App.tsx", "r") as f:
    content = f.read()

old_stats = """    // Expenses by category
    const calculateTotal = (category: string) => {
      return currentYearBudgets.filter(b => b.belonging === category).reduce((sum, b) => {
        return sum + (b.frequency === 'monthly' ? (b.allocated * 12) : b.allocated);
      }, 0);
    };"""

new_stats = """    // Expenses by category
    const calculateTotal = (category: string) => {
      return currentYearBudgets.filter(b => (b.belonging || 'joint') === category).reduce((sum, b) => {
        return sum + (b.frequency === 'monthly' ? (b.allocated * 12) : b.allocated);
      }, 0);
    };"""

content = content.replace(old_stats, new_stats)

with open("src/App.tsx", "w") as f:
    f.write(content)
