import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';

const CATEGORIES = [
  'Current Assets', 'Non-Current Assets', 'Current Liabilities', 'Non-Current Liabilities',
  'Equity', 'Operating Revenue', 'Non-Operating Revenue', 'Direct Costs',
  'Operating Expenses', 'Financial Expenses', 'Tax',
];

export default function MappingPage() {
  const { projectId } = useParams();
  const mappings = useProjectStore((s) => s.getProjectMappings(projectId || ''));
  const updateMapping = useProjectStore((s) => s.updateMapping);

  const mapped = mappings.filter(m => m.isMapped).length;
  const unmapped = mappings.filter(m => !m.isMapped).length;

  const handleAutoMap = () => {
    mappings.filter(m => !m.isMapped).forEach(m => {
      if (projectId && m.suggestedCategory) updateMapping(projectId, m.id, m.suggestedCategory);
    });
  };

  return (
    <div>
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Account Mapping</h1>
          <p className="page-subtitle">Map accounts to financial statement categories</p>
        </div>
        {unmapped > 0 && (
          <Button onClick={handleAutoMap} variant="outline" size="sm">
            <Sparkles className="h-3 w-3 mr-1" />Accept All Suggestions
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-success" />
          <span className="text-muted-foreground">{mapped} mapped</span>
        </div>
        {unmapped > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-muted-foreground">{unmapped} unmapped</span>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Account Name</th>
              <th>Type</th>
              <th>Suggested</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className={!m.isMapped ? 'bg-warning/5' : ''}>
                <td className="mono font-medium">{m.accountCode}</td>
                <td className="font-medium">{m.accountName}</td>
                <td><span className="text-xs capitalize text-muted-foreground">{m.type}</span></td>
                <td className="text-xs text-muted-foreground">{m.suggestedCategory}</td>
                <td className="min-w-[200px]">
                  <Select
                    value={m.confirmedCategory || undefined}
                    onValueChange={(val) => projectId && updateMapping(projectId, m.id, val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td><StatusBadge status={m.isMapped ? 'mapped' : 'unmapped'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
