import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { EuroCurrencyInput } from '@/components/EuroCurrencyInput';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FootnoteTextarea, FootnoteReadonlyView, type Footnote } from "./FootnoteTextarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { SaveIndicator } from "./SaveIndicator";

import { Proposal, WORK_PROGRAMMES, DESTINATIONS, getDestinationsForWorkProgramme } from "@/types/proposal";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TopicFormattingToolbar } from "./TopicFormattingToolbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Target, Euro, Calendar as CalendarIcon, ExternalLink, FileText, FileDown, CheckCircle2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TopicInformationPageProps {
  proposalId: string;
  proposal: Proposal | null;
  canEdit: boolean;
  isCoordinator?: boolean;
  onUpdateProposal: (updates: Record<string, any>) => Promise<void>;
  participants?: { id: string }[];
  budgetItems?: { amount: number; participantId: string }[];
}

function getCallStatus(openingDate?: Date, deadline?: Date): { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline'; className: string } | null {
  if (!openingDate) return null; // No badge when opening date not defined

  const now = new Date();

  // Check if past 17:00 Brussels time on deadline date
  if (deadline) {
    const brusselsDeadline = new Date(deadline.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
    brusselsDeadline.setHours(17, 0, 0, 0);
    // Convert back: get the Brussels 17:00 as a UTC-comparable timestamp
    const deadlineCutoff = new Date(deadline);
    deadlineCutoff.setHours(17, 0, 0, 0);
    // Use Intl to get accurate Brussels time comparison
    const nowBrussels = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
    const deadlineBrussels = new Date(deadline.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
    deadlineBrussels.setHours(17, 0, 0, 0);
    if (nowBrussels > deadlineBrussels) {
      return { label: 'Closed', variant: 'destructive', className: 'bg-destructive/10 text-destructive border-destructive/30' };
    }
  }

  if (now < openingDate) {
    return { label: 'Upcoming', variant: 'secondary', className: 'bg-muted text-muted-foreground' };
  }

  if (openingDate && now >= openingDate) {
    return { label: 'Open for submission', variant: 'default', className: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' };
  }

  return null;
}

/** Parse a budget string that may be a range like "3,500,000–4,000,000" into [min, max] numbers */
function parseBudgetRange(val: string): [number, number] | null {
  if (!val) return null;
  const parts = val.split('–').map(p => parseFloat(p.replace(/[^0-9.]/g, '')));
  if (parts.length === 1 && !isNaN(parts[0]) && parts[0] > 0) return [parts[0], parts[0]];
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] > 0 && parts[1] > 0) return [parts[0], parts[1]];
  return null;
}

function IndicativeProjectsField({ totalBudgetText, totalBudget, budgetPerProject }: { totalBudgetText?: string; totalBudget?: number; budgetPerProject: string }) {
  const computed = useMemo(() => {
    // Parse topic budget: prefer text (supports ranges), fall back to number
    const topicRange = totalBudgetText ? parseBudgetRange(totalBudgetText) : (totalBudget ? [totalBudget, totalBudget] as [number, number] : null);
    if (!topicRange || !budgetPerProject) return '–';
    const perProjectRange = parseBudgetRange(budgetPerProject);
    if (!perProjectRange) return '–';
    const [topicMin, topicMax] = topicRange;
    const [ppMin, ppMax] = perProjectRange;
    const low = Math.floor(topicMin / ppMax);
    const high = Math.floor(topicMax / ppMin);
    if (low === high) return high.toString();
    if (low > high) return `${high}–${low}`;
    return `${low}–${high}`;
  }, [totalBudgetText, totalBudget, budgetPerProject]);

  return <p className="text-sm font-medium">{computed}</p>;
}

export function TopicInformationPage({
  proposalId,
  proposal,
  canEdit,
  isCoordinator = false,
  onUpdateProposal,
  participants = [],
  budgetItems = [],
}: TopicInformationPageProps) {
  const [editedProposal, setEditedProposal] = useState(proposal);
  const [importingTopic, setImportingTopic] = useState(false);
  const [importingDestination, setImportingDestination] = useState(false);
  const [pendingBudgetType, setPendingBudgetType] = useState<'traditional' | 'lump_sum' | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [availableDestinations, setAvailableDestinations] = useState(
    proposal?.workProgramme ? getDestinationsForWorkProgramme(proposal.workProgramme) : []
  );

  // Refs for description textareas (for formatting toolbar)
  const expectedOutcomeRef = useRef<HTMLTextAreaElement>(null);
  const scopeRef = useRef<HTMLTextAreaElement>(null);
  const destinationRef = useRef<HTMLTextAreaElement>(null);
  const [activeFieldKey, setActiveFieldKey] = useState<'expectedOutcome' | 'scope' | 'destination' | null>(null);

  const activeTextareaRef = useMemo(() => {
    if (activeFieldKey === 'expectedOutcome') return expectedOutcomeRef;
    if (activeFieldKey === 'scope') return scopeRef;
    if (activeFieldKey === 'destination') return destinationRef;
    return { current: null } as React.RefObject<HTMLTextAreaElement | null>;
  }, [activeFieldKey]);

  const handleToolbarTextChange = useCallback((newValue: string) => {
    if (!editedProposal) return;
    if (activeFieldKey === 'expectedOutcome') {
      setEditedProposal({ ...editedProposal, topicExpectedOutcome: newValue } as any);
    } else if (activeFieldKey === 'scope') {
      setEditedProposal({ ...editedProposal, topicScope: newValue } as any);
    } else if (activeFieldKey === 'destination') {
      setEditedProposal({ ...editedProposal, topicDestinationDescription: newValue } as any);
    }
  }, [editedProposal, activeFieldKey]);

  const handleToolbarInsertFootnote = useCallback(() => {
    if (!editedProposal || !activeFieldKey) return;
    const textarea = activeTextareaRef.current;
    if (!textarea) return;

    const isDestination = activeFieldKey === 'destination';
    const footnotes: any[] = isDestination
      ? ((editedProposal as any)?.destinationFootnotes || [])
      : ((editedProposal as any)?.topicFootnotes || []);
    const nextNumber = footnotes.length + 1;
    const newFootnote = { id: crypto.randomUUID(), text: "" };

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const marker = `[${nextNumber}]`;
    const fieldKey = activeFieldKey === 'expectedOutcome' ? 'topicExpectedOutcome'
      : activeFieldKey === 'scope' ? 'topicScope' : 'topicDestinationDescription';
    const currentVal = (editedProposal as any)?.[fieldKey] || '';
    const newValue = currentVal.slice(0, start) + marker + currentVal.slice(end);

    const footnotesKey = isDestination ? 'destinationFootnotes' : 'topicFootnotes';
    setEditedProposal({ ...editedProposal, [fieldKey]: newValue, [footnotesKey]: [...footnotes, newFootnote] } as any);

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + marker.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [editedProposal, activeFieldKey, activeTextareaRef]);

  const userCanEdit = canEdit && isCoordinator;

  useEffect(() => {
    if (proposal) setEditedProposal(proposal);
  }, [proposal]);

  useEffect(() => {
    if (editedProposal?.workProgramme) {
      setAvailableDestinations(getDestinationsForWorkProgramme(editedProposal.workProgramme));
    }
  }, [editedProposal?.workProgramme]);

  const hasUnsavedChanges = userCanEdit && editedProposal && proposal && JSON.stringify(editedProposal) !== JSON.stringify(proposal);

  // Auto-save
  const debouncedSave = useCallback((data: typeof editedProposal) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaving(true);
    saveTimeoutRef.current = setTimeout(async () => {
      if (onUpdateProposal && data) {
        await onUpdateProposal(data);
        setLastSaved(new Date());
      }
      setSaving(false);
    }, 1000);
  }, [onUpdateProposal]);

  useEffect(() => {
    if (userCanEdit && editedProposal && proposal && JSON.stringify(editedProposal) !== JSON.stringify(proposal)) {
      debouncedSave(editedProposal);
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [editedProposal, userCanEdit, proposal, debouncedSave]);

  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal?.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal?.destination);
  const totalBudgetFromItems = budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const isEditing = userCanEdit;

  const callStatus = getCallStatus(proposal?.openingDate, proposal?.deadline);

  // Fetch topic description
  const handleFetchTopicDescription = async () => {
    if (!proposal?.topicUrl || !proposalId) {
      toast.error('No topic URL configured');
      return;
    }
    setImportingTopic(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-topic', {
        body: { proposalId, topicUrl: proposal.topicUrl },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Topic content imported successfully');
        await onUpdateProposal({});
      } else {
        toast.error(data?.error || 'Failed to import topic content');
      }
    } catch (error) {
      console.error('Error importing topic:', error);
      toast.error('Failed to import topic content');
    } finally {
      setImportingTopic(false);
    }
  };

  // For destination, reuse same function (it fetches both)
  const handleFetchDestinationDescription = async () => {
    if (!proposal?.topicUrl || !proposalId) {
      toast.error('No topic URL configured');
      return;
    }
    setImportingDestination(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-topic', {
        body: { proposalId, topicUrl: proposal.topicUrl },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Destination content imported successfully');
        await onUpdateProposal({});
      } else {
        toast.error(data?.error || 'Failed to import content');
      }
    } catch (error) {
      console.error('Error importing destination:', error);
      toast.error('Failed to import destination content');
    } finally {
      setImportingDestination(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-muted/30">
      {userCanEdit && (
        <TopicFormattingToolbar
          activeTextareaRef={activeTextareaRef}
          onTextChange={handleToolbarTextChange}
          onInsertFootnote={handleToolbarInsertFootnote}
        />
      )}
      <div className="max-w-7xl mx-auto space-y-4 p-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Topic information</h1>
          {userCanEdit && <SaveIndicator saving={saving} lastSaved={lastSaved} hasUnsavedChanges={!!hasUnsavedChanges} />}
        </div>

        {/* General Topic Information Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="w-4 h-4" />
                General topic information
              </CardTitle>
              {proposal?.topicUrl && !isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => window.open(proposal.topicUrl, '_blank')}
                >
                  <ExternalLink className="w-3 h-3" />
                  View on portal
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Topic ID</label>
              {isEditing && editedProposal ? (
                <Input
                  value={editedProposal.topicId || ''}
                  onChange={(e) => setEditedProposal({ ...editedProposal, topicId: e.target.value })}
                  placeholder="e.g. HORIZON-CL5-2026-D1-01"
                  className="h-8 text-sm"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{proposal?.topicId || 'Not specified'}</p>
                  {proposal?.topicUrl && (
                    <a
                      href={proposal.topicUrl.startsWith('http') ? proposal.topicUrl : `https://${proposal.topicUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Topic
                    </a>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Topic title</label>
              {isEditing && editedProposal ? (
                <Input
                  value={editedProposal.topicTitle || ''}
                  onChange={(e) => setEditedProposal({ ...editedProposal, topicTitle: e.target.value })}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm font-medium">{proposal?.topicTitle || '–'}</p>
              )}
            </div>

            {isEditing && editedProposal && (
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Link to topic description</label>
                <Input
                  value={editedProposal.topicUrl || ''}
                  onChange={(e) => setEditedProposal({ ...editedProposal, topicUrl: e.target.value })}
                  placeholder="Portal URL (https://ec.europa.eu/...)"
                  type="url"
                  className="h-8 text-sm"
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Work programme</label>
                {isEditing && editedProposal ? (
                  <Select
                    value={editedProposal.workProgramme || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, workProgramme: v, destination: undefined })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select work programme" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_PROGRAMMES.map(wp => (
                        <SelectItem key={wp.id} value={wp.id}>
                          {wp.abbreviation} - {wp.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">
                    {workProgramme ? `${workProgramme.abbreviation} - ${workProgramme.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Destination</label>
                {isEditing && editedProposal ? (
                  <Select
                    value={editedProposal.destination || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, destination: v })}
                    disabled={!editedProposal.workProgramme}
                  >
                    <SelectTrigger className="h-8 text-sm [&>span]:truncate">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {availableDestinations.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.abbreviation} - {d.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">
                    {destination ? `${destination.abbreviation} - ${destination.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Proposal stage</label>
                <p className="text-sm font-medium">
                  {proposal?.submissionStage === 'stage_1' ? 'Pre-proposal (stage 1)' : 'Full proposal'}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Type of action</label>
                <p className="text-sm font-medium">{proposal?.type || 'Not specified'}</p>
              </div>
            </div>

            <Separator />

            {/* Key Dates with call status */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <label className="text-xs text-muted-foreground block">Opening date</label>
                  {callStatus && (
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4", callStatus.className)}>
                      {callStatus.label}
                    </Badge>
                  )}
                </div>
                {isEditing && editedProposal ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !(editedProposal as any).openingDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {(editedProposal as any).openingDate ? format((editedProposal as any).openingDate, 'do MMMM yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={(editedProposal as any).openingDate}
                        onSelect={(date) => setEditedProposal({ ...editedProposal, openingDate: date } as any)}
                        className="pointer-events-auto"
                      />
                      <div className="px-3 pb-2">
                        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setEditedProposal({ ...editedProposal, openingDate: undefined } as any)}>
                          Reset
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <p className="text-sm font-medium">
                    {(proposal as any)?.openingDate ? format((proposal as any).openingDate, 'do MMMM yyyy') : 'Not set'}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Deadline (17:00 Brussels time)</label>
                {isEditing && editedProposal ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !editedProposal.deadline && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {editedProposal.deadline ? format(editedProposal.deadline, 'do MMMM yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={editedProposal.deadline}
                        onSelect={(date) => setEditedProposal({ ...editedProposal, deadline: date })}
                        disabled={(date) => !!(editedProposal as any).openingDate && date < (editedProposal as any).openingDate}
                        className="pointer-events-auto"
                      />
                      <div className="px-3 pb-2">
                        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setEditedProposal({ ...editedProposal, deadline: undefined })}>
                          Reset
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <p className="text-sm font-medium">
                    {proposal?.deadline ? format(proposal.deadline, 'do MMMM yyyy') : 'Not set'}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Budget Overview Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Euro className="w-4 h-4" />
              Budget overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Row 1: Topic budget + Budget type */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Indicative budget (topic)</label>
                {isEditing && editedProposal ? (
                  <EuroCurrencyInput
                    value={(editedProposal as any).totalBudgetText || (editedProposal.totalBudget ? editedProposal.totalBudget.toString() : '')}
                    onChange={(val) => {
                      // Also parse first number for backwards compat with totalBudget (number)
                      const firstNum = parseFloat(val.replace(/[^0-9]/g, ''));
                      setEditedProposal({ ...editedProposal, totalBudgetText: val, totalBudget: isNaN(firstNum) ? undefined : firstNum } as any);
                    }}
                    placeholder="e.g. 21,000,000"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium">
                    {(proposal as any)?.totalBudgetText
                      ? `€${(proposal as any).totalBudgetText}`
                      : proposal?.totalBudget
                        ? `€${proposal.totalBudget.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : '–'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget type</label>
                {isEditing && editedProposal ? (
                  <>
                    <Select
                      value={editedProposal.budgetType}
                      onValueChange={(v: 'traditional' | 'lump_sum') => {
                        if (v !== editedProposal.budgetType) setPendingBudgetType(v);
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="traditional">Actual costs</SelectItem>
                        <SelectItem value="lump_sum">Lump sum</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog open={!!pendingBudgetType} onOpenChange={(open) => !open && setPendingBudgetType(null)}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Change budget type?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Changing from <strong>{editedProposal.budgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}</strong> to <strong>{pendingBudgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}</strong>. Are you sure?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => { if (pendingBudgetType) setEditedProposal({ ...editedProposal, budgetType: pendingBudgetType }); setPendingBudgetType(null); }}>
                            Change budget type
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <p className="text-sm font-medium">{proposal?.budgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}</p>
                )}
              </div>
            </div>

            {/* Row 2: Budget per project + Indicative no. projects */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Indicative budget per project</label>
                {isEditing && editedProposal ? (
                  <EuroCurrencyInput
                    value={(editedProposal as any).indicativeBudgetPerProject || ''}
                    onChange={(val) => setEditedProposal({ ...editedProposal, indicativeBudgetPerProject: val } as any)}
                    placeholder="e.g. 3,500,000–4,000,000"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium">
                    {(proposal as any)?.indicativeBudgetPerProject ? `€${(proposal as any).indicativeBudgetPerProject}` : '–'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Indicative № projects to be funded</label>
                <IndicativeProjectsField
                  totalBudgetText={isEditing ? (editedProposal as any)?.totalBudgetText : (proposal as any)?.totalBudgetText}
                  totalBudget={isEditing ? editedProposal?.totalBudget : proposal?.totalBudget}
                  budgetPerProject={(isEditing ? (editedProposal as any)?.indicativeBudgetPerProject : (proposal as any)?.indicativeBudgetPerProject) || ''}
                />
              </div>
            </div>

            {/* Row 3: FSTP checkbox */}
            <div>
              {canEdit ? (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="uses-fstp-topic"
                    checked={editedProposal?.usesFstp || false}
                    onCheckedChange={(checked) => {
                      if (isEditing && editedProposal) {
                        setEditedProposal({ ...editedProposal, usesFstp: checked === true } as any);
                      } else {
                        onUpdateProposal({ usesFstp: checked === true });
                      }
                    }}
                  />
                  <Label htmlFor="uses-fstp-topic" className="text-sm cursor-pointer">
                    FSTP possible under this topic
                  </Label>
                </div>
              ) : proposal?.usesFstp ? (
                <div className="flex items-center space-x-2">
                  <Checkbox id="uses-fstp-topic-ro" checked disabled />
                  <Label htmlFor="uses-fstp-topic-ro" className="text-sm text-muted-foreground">
                    FSTP possible under this topic
                  </Label>
                </div>
              ) : null}
            </div>

            {/* FSTP sub-fields (shown when FSTP is checked) */}
            {(isEditing ? editedProposal?.usesFstp : proposal?.usesFstp) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Budget available for FSTP</label>
                  {isEditing && editedProposal ? (
                    <EuroCurrencyInput
                      value={(editedProposal as any).fstpBudget || ''}
                      onChange={(val) => setEditedProposal({ ...editedProposal, fstpBudget: val } as any)}
                      placeholder="e.g. 1,000,000 or 20%"
                      className="h-8 text-sm"
                      allowPercent
                      showEuroPrefix={!((editedProposal as any).fstpBudget || '').includes('%')}
                    />
                  ) : (
                    <p className="text-sm font-medium">
                      {(proposal as any)?.fstpBudget || '–'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Budget available per third party</label>
                  {isEditing && editedProposal ? (
                    <EuroCurrencyInput
                      value={(editedProposal as any).fstpBudgetPerThirdParty || ''}
                      onChange={(val) => setEditedProposal({ ...editedProposal, fstpBudgetPerThirdParty: val } as any)}
                      placeholder="e.g. 60,000–100,000"
                      className="h-8 text-sm"
                    />
                  ) : (
                    <p className="text-sm font-medium">
                      {(proposal as any)?.fstpBudgetPerThirdParty ? `€${(proposal as any).fstpBudgetPerThirdParty}` : '–'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Topic Description Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" />
                Topic description
              </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Expected outcome</label>
              {userCanEdit ? (
                <FootnoteTextarea
                  value={(editedProposal as any)?.topicExpectedOutcome || ''}
                  onChange={(val) => setEditedProposal({ ...editedProposal, topicExpectedOutcome: val } as any)}
                  footnotes={(editedProposal as any)?.topicFootnotes || []}
                  onFootnotesChange={(fns) => setEditedProposal({ ...editedProposal, topicFootnotes: fns } as any)}
                  placeholder=""
                  hideInlineFootnoteButton
                  textareaRef={expectedOutcomeRef}
                  onFocus={() => setActiveFieldKey('expectedOutcome')}
                />
              ) : (
                <FootnoteReadonlyView
                  text={proposal?.topicExpectedOutcome}
                  footnotes={proposal?.topicFootnotes}
                  emptyMessage="No expected outcome available"
                />
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Scope</label>
              {userCanEdit ? (
                <FootnoteTextarea
                  value={(editedProposal as any)?.topicScope || ''}
                  onChange={(val) => setEditedProposal({ ...editedProposal, topicScope: val } as any)}
                  footnotes={(editedProposal as any)?.topicFootnotes || []}
                  onFootnotesChange={(fns) => setEditedProposal({ ...editedProposal, topicFootnotes: fns } as any)}
                  placeholder=""
                  hideInlineFootnoteButton
                  textareaRef={scopeRef}
                  onFocus={() => setActiveFieldKey('scope')}
                />
              ) : (
                <FootnoteReadonlyView
                  text={proposal?.topicScope}
                  footnotes={proposal?.topicFootnotes}
                  emptyMessage="No scope available"
                />
              )}
            </div>
            {proposal?.topicContentImportedAt && (
              <p className="text-xs text-muted-foreground italic">
                Last imported: {format(proposal.topicContentImportedAt, 'dd MMM yyyy, HH:mm')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Destination Description Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" />
                Destination description
              </CardTitle>
          </CardHeader>
          <CardContent>
            {userCanEdit ? (
              <FootnoteTextarea
                value={(editedProposal as any)?.topicDestinationDescription || ''}
                onChange={(val) => setEditedProposal({ ...editedProposal, topicDestinationDescription: val } as any)}
                footnotes={(editedProposal as any)?.destinationFootnotes || []}
                onFootnotesChange={(fns) => setEditedProposal({ ...editedProposal, destinationFootnotes: fns } as any)}
                placeholder=""
                minHeight="200px"
                hideInlineFootnoteButton
                textareaRef={destinationRef}
                onFocus={() => setActiveFieldKey('destination')}
              />
            ) : (
              <FootnoteReadonlyView
                text={proposal?.topicDestinationDescription}
                footnotes={proposal?.destinationFootnotes}
                emptyMessage="No destination description available"
                maxHeight="max-h-64"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
