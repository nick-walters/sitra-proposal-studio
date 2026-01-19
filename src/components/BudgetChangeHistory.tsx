import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { History, Plus, Pencil, Trash2 } from 'lucide-react';
import type { BudgetChange } from '@/hooks/useBudget';

interface BudgetChangeHistoryProps {
  changes: BudgetChange[];
}

const changeTypeConfig = {
  create: { icon: Plus, color: 'bg-green-500', label: 'Added' },
  update: { icon: Pencil, color: 'bg-blue-500', label: 'Updated' },
  delete: { icon: Trash2, color: 'bg-red-500', label: 'Deleted' },
};

export function BudgetChangeHistory({ changes }: BudgetChangeHistoryProps) {
  if (changes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="w-5 h-5" />
            Change History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-8">
            No changes recorded yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="w-5 h-5" />
          Change History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="divide-y">
            {changes.map((change) => {
              const config = changeTypeConfig[change.changeType];
              const Icon = config.icon;

              return (
                <div key={change.id} className="p-4 hover:bg-muted/50">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{change.userName}</span>
                        <Badge variant="outline" className="text-xs">
                          {config.label}
                        </Badge>
                        {change.fieldChanged && (
                          <span className="text-xs text-muted-foreground">
                            {change.fieldChanged}
                          </span>
                        )}
                      </div>
                      
                      {change.changeType === 'update' && change.oldValue && change.newValue && (
                        <div className="mt-1 text-sm">
                          <span className="line-through text-muted-foreground">
                            {change.fieldChanged === 'amount' 
                              ? `€${parseFloat(change.oldValue).toLocaleString()}`
                              : change.oldValue}
                          </span>
                          <span className="mx-2">→</span>
                          <span className="text-foreground font-medium">
                            {change.fieldChanged === 'amount'
                              ? `€${parseFloat(change.newValue).toLocaleString()}`
                              : change.newValue}
                          </span>
                        </div>
                      )}

                      {change.changeType === 'create' && change.newValue && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Created item in {change.newValue}
                        </p>
                      )}

                      {change.changeType === 'delete' && change.oldValue && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Removed item from {change.oldValue}
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(change.createdAt), 'dd MMM yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
