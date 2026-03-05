import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProposalRole } from '@/hooks/useProposalRole';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format, eachDayOfInterval, isWeekend, getDay, addDays, isSameDay, startOfDay } from 'date-fns';

// Finnish public holidays (fixed + Easter-based)
function getFinnishHolidays(year: number): Date[] {
  const fixed = [
    new Date(year, 0, 1),
    new Date(year, 0, 6),
    new Date(year, 4, 1),
    new Date(year, 11, 6),
    new Date(year, 11, 24),
    new Date(year, 11, 25),
    new Date(year, 11, 26),
  ];

  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month, day);

  const easterBased = [
    addDays(easter, -2),
    addDays(easter, 0),
    addDays(easter, 1),
    addDays(easter, 39),
  ];

  const midsummerEve = (() => {
    for (let d = 19; d <= 25; d++) {
      const date = new Date(year, 5, d);
      if (getDay(date) === 5) return date;
    }
    return new Date(year, 5, 20);
  })();
  const midsummerDay = addDays(midsummerEve, 1);

  const allSaintsDay = (() => {
    for (let d = 31; d <= 37; d++) {
      const date = d <= 31 ? new Date(year, 9, d) : new Date(year, 10, d - 31);
      if (getDay(date) === 6) return date;
    }
    return new Date(year, 10, 1);
  })();

  return [...fixed, ...easterBased, midsummerEve, midsummerDay, allSaintsDay];
}

function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some(h => isSameDay(h, date));
}

interface AvailabilityGanttProps {
  proposalId: string;
  startDate: Date;
  endDate: Date;
}

interface UserRow {
  userId: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
}

interface OrgGroup {
  participantNumber: number;
  shortName: string;
  members: UserRow[];
  isUngrouped?: boolean;
}

export function AvailabilityGantt({ proposalId, startDate, endDate }: AvailabilityGanttProps) {
  const { user } = useAuth();
  const { roleTier } = useProposalRole(proposalId);
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragUserId, setDragUserId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<'mark' | 'unmark'>('mark');
  const [draggedDates, setDraggedDates] = useState<Set<string>>(new Set());

  const isAdmin = roleTier === 'coordinator'; // coordinator/admin/owner all map to 'coordinator'

  const safeStart = startOfDay(startDate);
  const safeEnd = startOfDay(endDate);
  const days = useMemo(() => eachDayOfInterval({ start: safeStart, end: safeEnd }), [safeStart.getTime(), safeEnd.getTime()]);

  const holidays = useMemo(() => {
    const years = new Set(days.map(d => d.getFullYear()));
    return Array.from(years).flatMap(y => getFinnishHolidays(y));
  }, [days]);

  // Fetch all users with access to this proposal, grouped by participant org
  const { data: orgGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['availability-groups', proposalId],
    queryFn: async () => {
      // 1. Get all user IDs with access to this proposal
      const { data: roles, error: rErr } = await supabase
        .from('user_roles')
        .select('user_id, role, proposal_id')
        .or(`proposal_id.eq.${proposalId},proposal_id.is.null`);
      if (rErr) throw rErr;

      // Filter to users who actually have access
      const accessUserIds = new Set<string>();
      for (const r of roles || []) {
        if (r.proposal_id === proposalId) {
          accessUserIds.add(r.user_id);
        } else if (!r.proposal_id && (r.role === 'owner' || r.role === 'admin')) {
          accessUserIds.add(r.user_id);
        }
      }

      if (accessUserIds.size === 0) return [];

      const userIdArr = Array.from(accessUserIds);

      // 2. Get profiles for all these users
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIdArr);
      if (pErr) throw pErr;

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // 3. Get participants for this proposal
      const { data: participants, error: partErr } = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (partErr) throw partErr;

      // 4. Get participant_members to map user_id → participant
      const { data: members, error: memErr } = await supabase
        .from('participant_members')
        .select('participant_id, user_id')
        .in('participant_id', (participants || []).map(p => p.id))
        .not('user_id', 'is', null);
      if (memErr) throw memErr;

      // Build user→participant mapping
      const userToParticipant = new Map<string, string>();
      for (const m of members || []) {
        if (m.user_id) userToParticipant.set(m.user_id, m.participant_id);
      }

      const participantMap = new Map((participants || []).map(p => [p.id, p]));

      // 5. Group users by participant org
      const grouped = new Map<string, { partNum: number; shortName: string; members: UserRow[] }>();
      const ungrouped: UserRow[] = [];

      for (const uid of userIdArr) {
        const prof = profileMap.get(uid);
        if (!prof) continue;
        const row: UserRow = {
          userId: uid,
          fullName: prof.full_name || prof.email || 'Unknown',
          email: prof.email,
          avatarUrl: prof.avatar_url,
        };

        const partId = userToParticipant.get(uid);
        if (partId) {
          const part = participantMap.get(partId);
          if (part) {
            const key = partId;
            if (!grouped.has(key)) {
              grouped.set(key, {
                partNum: part.participant_number,
                shortName: part.organisation_short_name || part.organisation_name,
                members: [],
              });
            }
            grouped.get(key)!.members.push(row);
            continue;
          }
        }
        ungrouped.push(row);
      }

      // Sort groups by participant number
      const result: OrgGroup[] = Array.from(grouped.values())
        .sort((a, b) => a.partNum - b.partNum)
        .map(g => ({ participantNumber: g.partNum, shortName: g.shortName, members: g.members }));

      // Add ungrouped users without a group header
      if (ungrouped.length > 0) {
        result.push({ participantNumber: 999, shortName: '', members: ungrouped, isUngrouped: true });
      }

      return result;
    },
    enabled: !!proposalId,
  });

  // Fetch unavailable dates
  const { data: unavailableDates = new Set<string>() } = useQuery({
    queryKey: ['user-availability', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_availability')
        .select('user_id, unavailable_date')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return new Set((data || []).map(d => `${d.user_id}:${d.unavailable_date}`));
    },
    enabled: !!proposalId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!proposalId) return;
    const channel = supabase
      .channel(`availability-${proposalId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'user_availability',
        filter: `proposal_id=eq.${proposalId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['user-availability', proposalId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proposalId, queryClient]);

  // Can the current user edit a given user's row?
  const canEdit = useCallback((targetUserId: string) => {
    if (targetUserId === user?.id) return true;
    return isAdmin;
  }, [user?.id, isAdmin]);

  const isUnavailable = useCallback((userId: string, date: Date) => {
    const key = `${userId}:${format(date, 'yyyy-MM-dd')}`;
    if (isDragging && dragUserId === userId && draggedDates.has(format(date, 'yyyy-MM-dd'))) {
      return dragMode === 'mark';
    }
    return unavailableDates.has(key);
  }, [unavailableDates, isDragging, dragUserId, dragMode, draggedDates]);

  const handleMouseDown = useCallback((userId: string, date: Date) => {
    if (!canEdit(userId)) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const key = `${userId}:${dateStr}`;
    const mode = unavailableDates.has(key) ? 'unmark' : 'mark';
    setIsDragging(true);
    setDragUserId(userId);
    setDragMode(mode);
    setDraggedDates(new Set([dateStr]));
  }, [canEdit, unavailableDates]);

  const handleMouseEnter = useCallback((userId: string, date: Date) => {
    if (!isDragging || userId !== dragUserId) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    setDraggedDates(prev => new Set([...prev, dateStr]));
  }, [isDragging, dragUserId]);

  const handleMouseUp = useCallback(async () => {
    if (!isDragging || !dragUserId) return;
    setIsDragging(false);

    const dates = Array.from(draggedDates);
    if (dragMode === 'mark') {
      const toInsert = dates.filter(d => !unavailableDates.has(`${dragUserId}:${d}`));
      if (toInsert.length > 0) {
        await supabase.from('user_availability').insert(
          toInsert.map(d => ({ proposal_id: proposalId, user_id: dragUserId, unavailable_date: d }))
        );
      }
    } else {
      const toDelete = dates.filter(d => unavailableDates.has(`${dragUserId}:${d}`));
      if (toDelete.length > 0) {
        for (const d of toDelete) {
          await supabase
            .from('user_availability')
            .delete()
            .eq('proposal_id', proposalId)
            .eq('user_id', dragUserId)
            .eq('unavailable_date', d);
        }
      }
    }

    setDragUserId(null);
    setDraggedDates(new Set());
    queryClient.invalidateQueries({ queryKey: ['user-availability', proposalId] });
  }, [isDragging, dragUserId, dragMode, draggedDates, unavailableDates, proposalId, queryClient]);

  // Auto-scroll to today on mount
  useEffect(() => {
    if (!scrollRef.current || days.length === 0) return;
    const today = startOfDay(new Date());
    const todayIndex = days.findIndex(d => isSameDay(d, today));
    if (todayIndex >= 0) {
      scrollRef.current.scrollLeft = todayIndex * CELL_W;
    }
  }, [days.length]);

  useEffect(() => {
    const up = () => handleMouseUp();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [handleMouseUp]);

  // Group days by month for headers
  const months = useMemo(() => {
    const result: { label: string; span: number; year: number }[] = [];
    let current = '';
    for (const d of days) {
      const label = format(d, 'MMM');
      const year = d.getFullYear();
      const key = `${label}-${year}`;
      if (key !== current) {
        result.push({ label, span: 1, year });
        current = key;
      } else {
        result[result.length - 1].span++;
      }
    }
    return result;
  }, [days]);

  // Compute today column index for the blue marker line
  const todayIndex = useMemo(() => {
    const today = startOfDay(new Date());
    return days.findIndex(d => isSameDay(d, today));
  }, [days]);

  const CELL_W = 22;
  const CELL_H = 28;
  const LABEL_W = 200;
  const MONTH_H = 24;
  const DAY_H = 20;

  if (groupsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
      <div className="max-w-full mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Availability</h1>
          <div className="flex items-center gap-4 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-background border-2 border-border inline-block" /> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-destructive/70 border-2 border-destructive/90 inline-block" /> Unavailable
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-muted border-2 border-border inline-block" /> Weekend / Holiday
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground -mt-2">
          Click or click and drag to select dates on which you are unavailable during the proposal preparation period.
        </p>

        <div
          className="border rounded-xl bg-card overflow-auto select-none shadow-sm"
          ref={scrollRef}
          style={{ maxHeight: 'calc(100vh - 220px)', position: 'relative' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px repeat(${days.length}, ${CELL_W}px)` }}>
            {/* Merged top-left cell spanning both header rows */}
            <div
              className="sticky left-0 top-0 z-40 bg-muted"
              style={{ gridRow: 'span 2', height: MONTH_H + DAY_H }}
            />

            {/* Month header row */}
            {months.map((m, i) => (
              <div
                key={i}
                className="sticky top-0 z-20 border-b border-border/50 text-[10px] font-medium text-muted-foreground text-center bg-muted"
                style={{ gridColumn: `span ${m.span}`, lineHeight: `${MONTH_H}px` }}
              >
                {m.label} {m.year !== new Date().getFullYear() ? m.year : ''}
              </div>
            ))}

            {/* Day number header row */}
            {days.map((d, i) => {
              const weekend = isWeekend(d);
              const hol = isHoliday(d, holidays);
              const isToday = isSameDay(d, new Date());
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "sticky z-20 border-b border-border/50 text-[9px] text-center",
                        (weekend || hol) ? "bg-muted/80 text-muted-foreground/40" : "bg-muted/50 backdrop-blur-sm text-muted-foreground",
                        isToday && "font-bold text-blue-600 dark:text-blue-400 border-l-2 border-l-blue-500",
                        !isToday && d.getDate() === 1 && "border-l border-border/60"
                      )}
                      style={{ top: `${MONTH_H}px`, lineHeight: `${DAY_H}px` }}
                    >
                      {d.getDate()}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {format(d, 'EEEE, d MMM yyyy')}
                    {hol && ' (Finnish public holiday)'}
                  </TooltipContent>
                </Tooltip>
              );
            })}

            {/* Data rows grouped by participant organisation */}
            {orgGroups.map((group) => (
              <div key={`group-${group.participantNumber}`} style={{ display: 'contents' }}>
                {/* Organisation group header — skip for ungrouped users */}
                {!group.isUngrouped && (
                  <div
                    className="sticky left-0 z-20 bg-muted/60 border-b px-3 flex items-center text-[11px] font-semibold text-foreground tracking-wide uppercase"
                    style={{ height: CELL_H - 4, gridColumn: '1 / -1' }}
                  >
                    <span className="text-muted-foreground/70 mr-1.5 font-normal">{group.participantNumber}.</span>
                    {group.shortName}
                  </div>
                )}

                {/* Member rows */}
                {group.members.map((member) => {
                  const isMe = member.userId === user?.id;
                  const editable = canEdit(member.userId);
                  const initials = member.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

                  return (
                    <div key={`row-${member.userId}`} style={{ display: 'contents' }}>
                      <div
                        className="sticky left-0 z-20 bg-card border-b border-border/40 px-3 flex items-center gap-2"
                        style={{ height: CELL_H }}
                      >
                        <Avatar className="h-5 w-5 shrink-0 ring-1 ring-border/50">
                          <AvatarImage src={member.avatarUrl || undefined} />
                          <AvatarFallback className="text-[8px] bg-muted">{initials}</AvatarFallback>
                        </Avatar>
                        <span className={cn("text-xs truncate", isMe ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {member.fullName}
                          {isMe && <span className="text-primary/70 ml-1 text-[10px]">(you)</span>}
                        </span>
                      </div>
                      {days.map((d, di) => {
                        const weekend = isWeekend(d);
                        const hol = isHoliday(d, holidays);
                        const greyed = weekend || hol;
                        const unavail = isUnavailable(member.userId, d);
                        const isFirstOfMonth = d.getDate() === 1;
                        const isToday = isSameDay(d, new Date());

                        return (
                          <div
                            key={`cell-${member.userId}-${di}`}
                            className={cn(
                              "border-b border-border/30 transition-colors",
                              greyed && "bg-muted/60",
                              !greyed && !unavail && "bg-background",
                              !greyed && unavail && "bg-destructive/60",
                              greyed && unavail && "bg-destructive/30",
                              editable && !greyed && "cursor-pointer hover:bg-primary/10",
                              !editable && "cursor-default",
                              isToday && "border-l-2 border-l-blue-500",
                              !isToday && isFirstOfMonth && "border-l border-border/50"
                            )}
                            style={{ height: CELL_H }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!greyed && editable) handleMouseDown(member.userId, d);
                            }}
                            onMouseEnter={() => {
                              if (!greyed && editable) handleMouseEnter(member.userId, d);
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
