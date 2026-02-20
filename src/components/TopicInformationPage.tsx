import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useState, useEffect, useCallback, useRef } from "react";
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

function getCallStatus(openingDate?: Date, deadline?: Date): { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline'; className: string } {
  const now = new Date();
  
  if (openingDate && now < openingDate) {
    return { label: 'Upcoming', variant: 'secondary', className: 'bg-muted text-muted-foreground' };
  }
  if (deadline && now > deadline) {
    return { label: 'Closed', variant: 'destructive', className: 'bg-destructive/10 text-destructive border-destructive/30' };
  }
  if (openingDate && deadline && now >= openingDate && now <= deadline) {
    return { label: 'Open for submission', variant: 'default', className: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' };
  }
  // If only deadline is set and hasn't passed
  if (deadline && now <= deadline) {
    return { label: 'Open for submission', variant: 'default', className: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' };
  }
  return { label: 'Unknown', variant: 'outline', className: '' };
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
  const [availableDestinations, setAvailableDestinations] = useState(
    proposal?.workProgramme ? getDestinationsForWorkProgramme(proposal.workProgramme) : []
  );

  const userCanEdit = canEdit && isCoordinator;

  useEffect(() => {
    if (proposal) setEditedProposal(proposal);
  }, [proposal]);

  useEffect(() => {
    if (editedProposal?.workProgramme) {
      setAvailableDestinations(getDestinationsForWorkProgramme(editedProposal.workProgramme));
    }
  }, [editedProposal?.workProgramme]);

  // Auto-save
  const debouncedSave = useCallback((data: typeof editedProposal) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (onUpdateProposal && data) await onUpdateProposal(data);
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
    <div className="flex-1 overflow-auto p-4 bg-muted/30">
      <div className="max-w-7xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">Topic information</h1>

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
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {availableDestinations.map(d => (
                        <SelectItem key={d.id} value={d.id} className="!pl-2">
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
                  {(proposal?.openingDate || proposal?.deadline) && (
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
                        {(editedProposal as any).openingDate ? format((editedProposal as any).openingDate, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={(editedProposal as any).openingDate}
                        onSelect={(date) => setEditedProposal({ ...editedProposal, openingDate: date } as any)}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <p className="text-sm font-medium">
                    {(proposal as any)?.openingDate ? format((proposal as any).openingDate, 'dd MMM yyyy') : 'Not set'}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Deadline</label>
                {isEditing && editedProposal ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !editedProposal.deadline && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {editedProposal.deadline ? format(editedProposal.deadline, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={editedProposal.deadline}
                        onSelect={(date) => setEditedProposal({ ...editedProposal, deadline: date })}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <p className="text-sm font-medium">
                    {proposal?.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
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
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget available (topic)</label>
                {isEditing && editedProposal ? (
                  <FormattedNumberInput
                    value={editedProposal.totalBudget || ''}
                    onChange={(val) => setEditedProposal({ ...editedProposal, totalBudget: val || undefined })}
                    placeholder="e.g. 5,000,000"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium">
                    {proposal?.totalBudget ? `€${proposal.totalBudget.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '–'}
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
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">№ projects to be funded</label>
                {isEditing && editedProposal ? (
                  <Select
                    value={editedProposal.expectedProjects || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, expectedProjects: v })}
                  >
                    <SelectTrigger className="w-32 h-8 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">{proposal?.expectedProjects || '–'}</p>
                )}
              </div>
              <div>
                {canEdit ? (
                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox
                      id="uses-fstp-topic"
                      checked={proposal?.usesFstp || false}
                      onCheckedChange={(checked) => onUpdateProposal({ usesFstp: checked === true })}
                    />
                    <Label htmlFor="uses-fstp-topic" className="text-sm cursor-pointer">
                      FSTP possible under this topic
                    </Label>
                  </div>
                ) : proposal?.usesFstp ? (
                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox id="uses-fstp-topic-ro" checked disabled />
                    <Label htmlFor="uses-fstp-topic-ro" className="text-sm text-muted-foreground">
                      FSTP possible under this topic
                    </Label>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Topic Description Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" />
                Topic description
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={handleFetchTopicDescription}
                disabled={!proposal?.topicUrl || importingTopic || !userCanEdit}
              >
                {importingTopic ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Fetching...</>
                ) : proposal?.topicDescription ? (
                  <><RefreshCw className="w-3 h-3" /> Refresh</>
                ) : (
                  <><FileDown className="w-3 h-3" /> Fetch info</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {userCanEdit ? (
              <Textarea
                value={(editedProposal as any)?.topicDescription || ''}
                onChange={(e) => setEditedProposal({ ...editedProposal, topicDescription: e.target.value } as any)}
                placeholder="Topic description will appear here after fetching from the portal URL, or you can enter it manually..."
                className="min-h-[200px] text-sm resize-none"
              />
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-4 max-h-96 overflow-y-auto">
                {proposal?.topicDescription || <span className="text-muted-foreground italic">No topic description available</span>}
              </div>
            )}
            {proposal?.topicContentImportedAt && (
              <p className="text-xs text-muted-foreground italic mt-2">
                Last imported: {format(proposal.topicContentImportedAt, 'dd MMM yyyy, HH:mm')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Destination Description Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" />
                Destination description
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={handleFetchDestinationDescription}
                disabled={!proposal?.topicUrl || importingDestination || !userCanEdit}
              >
                {importingDestination ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Fetching...</>
                ) : proposal?.topicDestinationDescription ? (
                  <><RefreshCw className="w-3 h-3" /> Refresh</>
                ) : (
                  <><FileDown className="w-3 h-3" /> Fetch info</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {userCanEdit ? (
              <Textarea
                value={(editedProposal as any)?.topicDestinationDescription || ''}
                onChange={(e) => setEditedProposal({ ...editedProposal, topicDestinationDescription: e.target.value } as any)}
                placeholder="Destination description will appear here after fetching from the portal URL, or you can enter it manually..."
                className="min-h-[200px] text-sm resize-none"
              />
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-4 max-h-64 overflow-y-auto">
                {proposal?.topicDestinationDescription || <span className="text-muted-foreground italic">No destination description available</span>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
