import { useParams } from 'react-router-dom';
import { useProjectEntries } from '@/hooks/useStableStoreSelectors';
import { useImportMetaStore } from '@/store/useImportMetaStore';
import { KPICard } from '@/components/shared/KPICard';
import { DollarSign, TrendingDown, TrendingUp, Percent, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['hsl(173,58%,39%)', 'hsl(210,92%,45%)', 'hsl(38,92%,50%)', 'hsl(152,69%,31%)', 'hsl(0,72%,51%)'];

export default function DashboardPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const entries = useProjectEntries(pid);
  const { score: reliabilityScore, lastImportDate } = useImportMetaStore((s) => s.getReliabilityScore(pid));

  const sumByPrefix = (prefixes: string[], field: 'debit' | 'credit') =>
    entries.filter(e => prefixes.some(p => e.accountCode.startsWith(p))).reduce((s, e) => s + e[field], 0);

  const revenue = sumByPrefix(['4'], 'credit');
  const cogs = sumByPrefix(['5'], 'debit');
  const salaries = sumByPrefix(['6000'], 'debit');
  const rent = sumByPrefix(['61'], 'debit');
  const utilities = sumByPrefix(['62'], 'debit');
  const interest = sumByPrefix(['7'], 'debit');
  const totalExpenses = cogs + salaries + rent + utilities + interest;
  const netIncome = revenue - totalExpenses;
  const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;

  const months = ['Jan', 'Feb', 'Mar'];
  const barData = months.map((m, i) => {
    const monthEntries = entries.filter(e => new Date(e.date).getMonth() === i);
    const rev = monthEntries.filter(e => e.accountCode.startsWith('4')).reduce((s, e) => s + e.credit, 0);
    const exp = monthEntries.filter(e => ['5', '6', '7'].some(c => e.accountCode.startsWith(c))).reduce((s, e) => s + e.debit, 0);
    return { month: m, Revenue: rev, Expenses: exp };
  });

  const lineData = months.map((m, i) => {
    const monthEntries = entries.filter(e => new Date(e.date).getMonth() === i);
    const rev = monthEntries.filter(e => e.accountCode.startsWith('4')).reduce((s, e) => s + e.credit, 0);
    const exp = monthEntries.filter(e => ['5', '6', '7'].some(c => e.accountCode.startsWith(c))).reduce((s, e) => s + e.debit, 0);
    return { month: m, Profit: rev - exp };
  });

  const pieData = [
    { name: 'COGS', value: cogs },
    { name: 'Salaries', value: salaries },
    { name: 'Rent', value: rent },
    { name: 'Utilities', value: utilities },
    { name: 'Interest', value: interest },
  ].filter(d => d.value > 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Key financial metrics and charts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard label="Revenue" value={revenue} previousValue={revenue * 0.87} format="currency" icon={<DollarSign className="h-4 w-4" />} />
        <KPICard label="Total Expenses" value={totalExpenses} previousValue={totalExpenses * 0.93} format="currency" icon={<TrendingDown className="h-4 w-4" />} />
        <KPICard label="Net Income" value={netIncome} previousValue={netIncome * 0.82} format="currency" icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard label="Gross Margin" value={grossMargin} previousValue={44.8} format="percentage" icon={<Percent className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-4">Revenue vs Expenses</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-4">Profit Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Line type="monotone" dataKey="Profit" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ fill: 'hsl(var(--chart-1))' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-4">Expense Breakdown</h3>
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={110} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
