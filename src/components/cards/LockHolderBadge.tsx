import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { LockHolder } from '@/hooks/useCardLocks';

function initialsOf(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Avatar of the user currently holding a lock, shown beside the red-bordered
 * target. Same photo-then-initials approach as the active-users panel.
 */
export function LockHolderBadge({ holder }: { holder: LockHolder }) {
  const name = holder.userName ?? 'Another user';
  return (
    <span className="flex shrink-0 items-center gap-1.5" title={`${name} is editing this`}>
      <Avatar className="h-6 w-6 border border-destructive">
        <AvatarImage src={holder.avatarUrl || undefined} alt={name} />
        <AvatarFallback className="text-[10px]">{initialsOf(holder.userName)}</AvatarFallback>
      </Avatar>
      <span className="hidden text-[11px] text-muted-foreground sm:inline">{name}</span>
    </span>
  );
}

export default LockHolderBadge;
