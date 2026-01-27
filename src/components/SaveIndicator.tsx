import { Check, Cloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveIndicatorProps {
  saving: boolean;
  lastSaved: Date | null;
  className?: string;
}

export function SaveIndicator({ saving, lastSaved, className }: SaveIndicatorProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {saving ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Saving...</span>
        </>
      ) : lastSaved ? (
        <>
          <Cloud className="w-3 h-3" />
          <Check className="w-3 h-3 text-success" />
          <span>Autosaved at {formatTime(lastSaved)}</span>
        </>
      ) : (
        <>
          <Cloud className="w-3 h-3" />
          <span>Autosave</span>
        </>
      )}
    </div>
  );
}
