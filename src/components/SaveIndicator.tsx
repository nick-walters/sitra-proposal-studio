import { Cloud } from "lucide-react";
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

  const state = saving || hasUnsavedChanges ? 'saving' : lastSaved ? 'saved' : 'idle';
  const isSaved = state === 'saved';

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Cloud className={cn("w-3.5 h-3.5", isSaved ? 'text-green-600' : 'text-muted-foreground')} />
      <div className="flex flex-col leading-none">
        {isSaved ? (
          <>
            <span className="text-xs font-medium text-green-600">Autosaved</span>
            {lastSaved && <span className="text-[10px] text-muted-foreground">{formatTime(lastSaved)}</span>}
          </>
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
