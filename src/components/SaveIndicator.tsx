import { Cloud, Check, Loader2, Save, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SaveIndicatorProps {
  saving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges?: boolean;
  saveError?: string | null;
  onSaveNow?: () => void;
  className?: string;
}

export function SaveIndicator({ saving, lastSaved, hasUnsavedChanges = false, saveError, onSaveNow, className }: SaveIndicatorProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const state = saveError ? 'error' : saving ? 'saving' : hasUnsavedChanges ? 'pending' : lastSaved ? 'saved' : 'idle';

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {state === 'error' ? (
        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
      ) : state === 'saved' ? (
        <span className="relative inline-flex">
          <Cloud className="w-3.5 h-3.5 text-green-600" />
          <Check className="absolute w-2 h-2 text-green-600 top-[3px] left-[3px] stroke-[3]" />
        </span>
      ) : state === 'saving' ? (
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
      ) : (
        <Cloud className="w-3.5 h-3.5 text-muted-foreground" />
      )}
      <div className="flex flex-col leading-none">
        {state === 'error' ? (
          <span className="text-[10px] font-medium text-destructive">Save failed</span>
        ) : state === 'saved' ? (
          <>
            <span className="text-xs font-medium text-green-600">Autosaved</span>
            {lastSaved && <span className="text-[10px] text-green-600">{formatTime(lastSaved)}</span>}
          </>
        ) : state === 'saving' ? (
          <span className="text-[10px] font-medium text-primary">Saving...</span>
        ) : (
          <>
            <span className="text-[10px] font-medium text-muted-foreground">Autosaves</span>
            <span className="text-[10px] text-muted-foreground">after 5 sec</span>
          </>
        )}
      </div>
      {onSaveNow && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "ml-1 h-6 px-2 gap-1 text-[10px] font-medium transition-colors",
            state === 'error'
              ? "text-destructive hover:text-destructive/80"
              : hasUnsavedChanges
                ? "text-primary hover:text-primary/80"
                : "text-muted-foreground hover:text-foreground"
          )}
          onClick={onSaveNow}
          disabled={saving}
          title={state === 'error' ? 'Retry saving (Ctrl+S)' : 'Save now (Ctrl+S)'}
        >
          <Save className="w-3 h-3" />
          <span>{state === 'error' ? 'Retry' : 'Save'}</span>
        </Button>
      )}
    </div>
  );
}
