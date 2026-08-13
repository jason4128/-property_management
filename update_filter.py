import sys

with open("src/App.tsx", "r") as f:
    content = f.read()

content = content.replace(
"""        if (belongingFilter === 'all') return true;
        if (belongingFilter === 'childcare') return b.belonging === 'childcare';
        if (belongingFilter === 'income') return b.belonging === 'income' || b.belonging === 'subsidy';
        return b.belonging === belongingFilter;""",
"""        const itemBelonging = b.belonging || 'joint';
        if (belongingFilter === 'all') return true;
        if (belongingFilter === 'childcare') return itemBelonging === 'childcare';
        if (belongingFilter === 'income') return itemBelonging === 'income' || itemBelonging === 'subsidy';
        return itemBelonging === belongingFilter;"""
)

with open("src/App.tsx", "w") as f:
    f.write(content)
