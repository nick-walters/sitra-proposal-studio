import { Cloud, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveIndicatorProps {
  saving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges?: boolean;
  className?: string;
}

export function SaveIndicator({ saving, lastSaved, hasUnsavedChanges = false, className }: SaveIndicatorProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const state = saving ? 'saving' : hasUnsavedChanges ? 'pending' : lastSaved ? 'saved' : 'idle';

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {state === 'saved' ? (
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
        {state === 'saved' ? (
          <>
            <span className="text-xs font-medium text-green-600">Autosaved</span>
            {lastSaved && <span className="text-[10px] text-muted-foreground">{formatTime(lastSaved)}</span>}
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
    </div>
  );
}
