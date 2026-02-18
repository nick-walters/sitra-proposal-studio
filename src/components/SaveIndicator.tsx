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

  // Determine color: saving = animate, unsaved = red, saved = green, idle = black
  const getIconColor = () => {
    if (saving) return 'text-muted-foreground animate-pulse';
    if (hasUnsavedChanges) return 'text-destructive';
    if (lastSaved) return 'text-green-600';
    return 'text-foreground';
  };

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Cloud className={cn("w-3.5 h-3.5", getIconColor())} />
      {saving ? (
        <span>Saving...</span>
      ) : lastSaved ? (
        <div className="flex flex-col leading-none">
          <span className="text-xs text-green-600 font-medium">Autosaved</span>
          <span className="text-[10px] text-muted-foreground">{formatTime(lastSaved)}</span>
        </div>
      ) : (
        <span>Autosave</span>
      )}
    </div>
  );
}
