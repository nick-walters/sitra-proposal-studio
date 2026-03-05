import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format, eachDayOfInterval, isWeekend, getDay, addDays, isSameDay, startOfDay } from 'date-fns';

// Finnish public holidays (fixed + Easter-based for common years)
function getFinnishHolidays(year: number): Date[] {
  const fixed = [
    new Date(year, 0, 1),   // New Year
    new Date(year, 0, 6),   // Epiphany
    new Date(year, 4, 1),   // May Day
    new Date(year, 5, 20),  // Midsummer Eve (approximate - actual is Fri before Sat between Jun 20-26)
    new Date(year, 11, 6),  // Independence Day
    new Date(year, 11, 24), // Christmas Eve
    new Date(year, 11, 25), // Christmas Day
    new Date(year, 11, 26), // St. Stephen's Day
  ];

  // Easter calculation (Anonymous Gregorian algorithm)
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
    addDays(easter, -2),  // Good Friday
    addDays(easter, 0),   // Easter Sunday
    addDays(easter, 1),   // Easter Monday
    addDays(easter, 39),  // Ascension Day
  ];

  // Midsummer Eve: Friday between June 19-25
  const midsummerEve = (() => {
    for (let d = 19; d <= 25; d++) {
      const date = new Date(year, 5, d);
      if (getDay(date) === 5) return date; // Friday
    }
    return new Date(year, 5, 20);
  })();

  // Midsummer Day: Saturday after midsummer eve
  const midsummerDay = addDays(midsummerEve, 1);

  // All Saints' Day: Saturday between Oct 31 and Nov 6
  const allSaintsDay = (() => {
    for (let d = 31; d <= 37; d++) {
      const date = d <= 31 ? new Date(year, 9, d) : new Date(year, 10, d - 31);
      if (getDay(date) === 6) return date; // Saturday
    }
    return new Date(year, 10, 1);
  })();

  // Replace approximate fixed midsummer with calculated
  const holidays = [
    ...fixed.filter(d => !(d.getMonth() === 5 && d.getDate() === 20)),
    ...easterBased,
    midsummerEve,
    midsummerDay,
    allSaintsDay,
  ];

  return holidays;
}

function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some(h => isSameDay(h, date));
}

interface AvailabilityGanttProps {
  proposalId: string;
  startDate: Date;
  endDate: Date;
}

interface ParticipantGroup {
  participantId: string;
  participantNumber: number;
  shortName: string;
  members: {
    userId: string;
    fullName: string;
    email: string | null;
    avatarUrl: string | null;
  }[];
}

export function AvailabilityGantt({ proposalId, startDate, endDate }: AvailabilityGanttProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragUserId, setDragUserId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<'mark' | 'unmark'>('mark');
  const [draggedDates, setDraggedDates] = useState<Set<string>>(new Set());

  const safeStart = startOfDay(startDate);
  const safeEnd = startOfDay(endDate);
  const days = useMemo(() => eachDayOfInterval({ start: safeStart, end: safeEnd }), [safeStart.getTime(), safeEnd.getTime()]);

  // Collect all years in range for holidays
  const holidays = useMemo(() => {
    const years = new Set(days.map(d => d.getFullYear()));
    return Array.from(years).flatMap(y => getFinnishHolidays(y));
  }, [days]);

  // Fetch participants with members who have user_id (platform access)
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['availability-groups', proposalId],
    queryFn: async () => {
      const { data: participants, error: pErr } = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (pErr) throw pErr;

      const { data: members, error: mErr } = await supabase
        .from('participant_members')
        .select('participant_id, user_id, full_name, email')
        .in('participant_id', (participants || []).map(p => p.id))
        .not('user_id', 'is', null);
      if (mErr) throw mErr;

      // Get avatar URLs from profiles
      const userIds = [...new Set((members || []).map(m => m.user_id!))];
      let profileMap = new Map<string, { avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', userIds);
        profileMap = new Map((profiles || []).map(p => [p.id, p]));
      }

      const result: ParticipantGroup[] = [];
      for (const p of participants || []) {
        const pMembers = (members || [])
          .filter(m => m.participant_id === p.id && m.user_id)
          .map(m => ({
            userId: m.user_id!,
            fullName: m.full_name,
            email: m.email,
            avatarUrl: profileMap.get(m.user_id!)?.avatar_url || null,
          }));
        if (pMembers.length > 0) {
          result.push({
            participantId: p.id,
            participantNumber: p.participant_number,
            shortName: p.organisation_short_name || p.organisation_name,
            members: pMembers,
          });
        }
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

  const isUnavailable = useCallback((userId: string, date: Date) => {
    const key = `${userId}:${format(date, 'yyyy-MM-dd')}`;
    // During drag, check pending changes
    if (isDragging && dragUserId === userId && draggedDates.has(format(date, 'yyyy-MM-dd'))) {
      return dragMode === 'mark';
    }
    return unavailableDates.has(key);
  }, [unavailableDates, isDragging, dragUserId, dragMode, draggedDates]);

  const toggleDate = useCallback(async (userId: string, date: Date) => {
    if (userId !== user?.id) return; // Can only edit own
    const dateStr = format(date, 'yyyy-MM-dd');
    const key = `${userId}:${dateStr}`;

    if (unavailableDates.has(key)) {
      await supabase
        .from('user_availability')
        .delete()
        .eq('proposal_id', proposalId)
        .eq('user_id', userId)
        .eq('unavailable_date', dateStr);
    } else {
      await supabase
        .from('user_availability')
        .insert({ proposal_id: proposalId, user_id: userId, unavailable_date: dateStr });
    }
    queryClient.invalidateQueries({ queryKey: ['user-availability', proposalId] });
  }, [unavailableDates, proposalId, user?.id, queryClient]);

  const handleMouseDown = useCallback((userId: string, date: Date) => {
    if (userId !== user?.id) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const key = `${userId}:${dateStr}`;
    const mode = unavailableDates.has(key) ? 'unmark' : 'mark';
    setIsDragging(true);
    setDragUserId(userId);
    setDragMode(mode);
    setDraggedDates(new Set([dateStr]));
  }, [user?.id, unavailableDates]);

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
      // Filter out already unavailable
      const toInsert = dates.filter(d => !unavailableDates.has(`${dragUserId}:${d}`));
      if (toInsert.length > 0) {
        await supabase.from('user_availability').insert(
          toInsert.map(d => ({ proposal_id: proposalId, user_id: dragUserId, unavailable_date: d }))
        );
      }
    } else {
      // Delete
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

  if (groupsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const CELL_W = 22;
  const CELL_H = 28;
  const LABEL_W = 200;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
      <div className="max-w-full mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Availability</h1>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-background border border-border inline-block" /> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-destructive/70 inline-block" /> Unavailable
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-muted inline-block" /> Weekend / Holiday
            </span>
          </div>
        </div>

        <div
          className="border rounded-lg bg-card overflow-auto select-none"
          ref={scrollRef}
          style={{ maxHeight: 'calc(100vh - 200px)' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px repeat(${days.length}, ${CELL_W}px)` }}>
            {/* Month header row */}
            <div className="sticky left-0 z-20 bg-card border-b border-r h-6" />
            {months.map((m, i) => (
              <div
                key={i}
                className="border-b text-[10px] font-medium text-muted-foreground text-center bg-card"
                style={{ gridColumn: `span ${m.span}`, lineHeight: '24px' }}
              >
                {m.label} {m.year !== new Date().getFullYear() ? m.year : ''}
              </div>
            ))}

            {/* Day number header row */}
            <div className="sticky left-0 z-20 bg-card border-b border-r h-5" />
            {days.map((d, i) => {
              const weekend = isWeekend(d);
              const hol = isHoliday(d, holidays);
              const isToday = isSameDay(d, new Date());
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "border-b text-[9px] text-center leading-5",
                        (weekend || hol) ? "bg-muted text-muted-foreground/50" : "text-muted-foreground",
                        isToday && "font-bold text-primary",
                        d.getDate() === 1 && "border-l border-border"
                      )}
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

            {/* Data rows grouped by participant */}
            {groups.map((group) => (
              <>
                {/* Participant group header */}
                <div
                  key={`group-${group.participantId}`}
                  className="sticky left-0 z-20 bg-muted/50 border-b border-r px-2 flex items-center text-xs font-semibold text-foreground"
                  style={{ height: CELL_H, gridColumn: `1 / -1` }}
                >
                  <span className="text-muted-foreground mr-1.5">{group.participantNumber}.</span>
                  {group.shortName}
                </div>

                {/* Member rows */}
                {group.members.map((member) => {
                  const isMe = member.userId === user?.id;
                  const initials = member.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

                  return (
                    <>
                      <div
                        key={`label-${member.userId}`}
                        className="sticky left-0 z-20 bg-card border-b border-r px-2 flex items-center gap-2"
                        style={{ height: CELL_H }}
                      >
                        <Avatar className="h-5 w-5 shrink-0">
                          <AvatarImage src={member.avatarUrl || undefined} />
                          <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                        </Avatar>
                        <span className={cn("text-xs truncate", isMe && "font-medium")}>
                          {member.fullName}
                          {isMe && <span className="text-muted-foreground ml-1">(you)</span>}
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
                              "border-b cursor-default transition-colors",
                              greyed && "bg-muted",
                              !greyed && !unavail && "bg-background hover:bg-accent/30",
                              !greyed && unavail && "bg-destructive/70",
                              greyed && unavail && "bg-destructive/40",
                              isMe && !greyed && "cursor-pointer",
                              isFirstOfMonth && "border-l border-border",
                              isToday && "ring-1 ring-inset ring-primary/40"
                            )}
                            style={{ height: CELL_H }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!greyed && isMe) handleMouseDown(member.userId, d);
                            }}
                            onMouseEnter={() => {
                              if (!greyed && isMe) handleMouseEnter(member.userId, d);
                            }}
                          />
                        );
                      })}
                    </>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
