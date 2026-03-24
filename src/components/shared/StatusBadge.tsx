import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  raw: 'bg-muted text-muted-foreground',
  processing: 'bg-warning/15 text-warning',
  processed: 'bg-info/15 text-info',
  validated: 'bg-success/15 text-success',
  error: 'bg-destructive/15 text-destructive',
  active: 'bg-success/15 text-success',
  archived: 'bg-muted text-muted-foreground',
  mapped: 'bg-success/15 text-success',
  unmapped: 'bg-warning/15 text-warning',
  draft: 'bg-muted text-muted-foreground',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn('status-badge', statusStyles[status] || statusStyles.raw, className)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
