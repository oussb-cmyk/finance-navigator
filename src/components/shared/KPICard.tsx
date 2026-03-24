import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: number;
  previousValue?: number;
  format: 'currency' | 'percentage' | 'number';
  icon?: React.ReactNode;
}

function formatValue(value: number, format: string) {
  if (format === 'currency') return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
  if (format === 'percentage') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

export function KPICard({ label, value, previousValue, format, icon }: KPICardProps) {
  const change = previousValue ? ((value - previousValue) / Math.abs(previousValue)) * 100 : 0;
  const trend = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'flat';

  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon && <span className="text-primary">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-foreground mono">{formatValue(value, format)}</div>
      {previousValue !== undefined && (
        <div className={cn(
          'flex items-center gap-1 mt-2 text-xs font-medium',
          trend === 'up' && 'text-success',
          trend === 'down' && 'text-destructive',
          trend === 'flat' && 'text-muted-foreground'
        )}>
          {trend === 'up' && <TrendingUp className="h-3 w-3" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3" />}
          {trend === 'flat' && <Minus className="h-3 w-3" />}
          <span>{change > 0 ? '+' : ''}{change.toFixed(1)}% vs prior</span>
        </div>
      )}
    </div>
  );
}
