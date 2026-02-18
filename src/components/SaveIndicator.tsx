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

  const getState = () => {
    if (saving || hasUnsavedChanges) return 'saving';
    if (lastSaved) return 'saved';
    return 'idle';
  };

  const state = getState();

  const iconColor = state === 'saving' ? 'text-destructive animate-pulse' : state === 'saved' ? 'text-green-600' : 'text-foreground';
  const textColor = state === 'saving' ? 'text-destructive' : state === 'saved' ? 'text-green-600' : 'text-foreground';
  const label = state === 'saving' ? 'Autosaving' : state === 'saved' ? 'Autosaved' : 'Autosave';

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Cloud className={cn("w-3.5 h-3.5", iconColor)} />
      <div className="flex flex-col leading-none">
        <span className={cn("text-xs font-medium", textColor)}>{label}</span>
        {state === 'saved' && lastSaved && (
          <span className="text-[10px] text-muted-foreground">{formatTime(lastSaved)}</span>
        )}
      </div>
    </div>
  );
}
