import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  User,
  Building2,
  FileText,
  Hash,
  Globe,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react';
import { Participant, ParticipantMember } from '@/types/proposal';
import { isEligibleForGEP } from '@/lib/countries';

interface ParticipantCompletenessCheckerProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
  participantMembers: ParticipantMember[];
}

interface CompletionIssue {
  participantNumber: number;
  participantName: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
  icon: React.ReactNode;
}

export function ParticipantCompletenessChecker({
  isOpen,
  onClose,
  participants,
  participantMembers,
}: ParticipantCompletenessCheckerProps) {
  const issues = useMemo(() => {
    const found: CompletionIssue[] = [];

    participants.forEach(p => {
      const name = p.organisationShortName || p.organisationName || `Participant ${p.participantNumber}`;
      const num = p.participantNumber;

      // Required fields
      if (!p.organisationName?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'Legal name', severity: 'error', message: 'Legal name is required', icon: <Building2 className="w-3.5 h-3.5" /> });
      }
      if (!p.organisationShortName?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'Short name', severity: 'error', message: 'Short name is required', icon: <Hash className="w-3.5 h-3.5" /> });
      }
      if (!p.country?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'Country', severity: 'error', message: 'Country is required', icon: <Globe className="w-3.5 h-3.5" /> });
      }
      if (!p.legalEntityType?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'Legal entity type', severity: 'error', message: 'Legal entity type is required', icon: <FileText className="w-3.5 h-3.5" /> });
      }

      // PIC number
      if (!p.picNumber?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'PIC', severity: 'warning', message: 'PIC number is missing', icon: <Hash className="w-3.5 h-3.5" /> });
      }

      // Contact details
      if (!p.contactEmail?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'Email', severity: 'warning', message: 'Contact email is missing', icon: <Mail className="w-3.5 h-3.5" /> });
      }
      if (!p.mainContactFirstName?.trim() && !p.mainContactLastName?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'Contact person', severity: 'warning', message: 'Main contact person is missing', icon: <User className="w-3.5 h-3.5" /> });
      }

      // Address
      if (!p.street?.trim() || !p.town?.trim() || !p.postcode?.trim()) {
        found.push({ participantNumber: num, participantName: name, field: 'Address', severity: 'warning', message: 'Address is incomplete', icon: <MapPin className="w-3.5 h-3.5" /> });
      }

      // GEP check for eligible organisations
      const gepEligible = ['HES', 'RES', 'PUB'].includes(p.organisationCategory || '') && isEligibleForGEP(p.country || '');
      if (gepEligible) {
        // Just flag if eligible - GEP data is managed separately
        found.push({ participantNumber: num, participantName: name, field: 'GEP', severity: 'info' as any, message: 'Ensure Gender Equality Plan is provided (required for HES/RES/PUB)', icon: <FileText className="w-3.5 h-3.5" /> });
      }

      // Team members check
      const members = participantMembers.filter(m => m.participantId === p.id);
      if (members.length === 0) {
        found.push({ participantNumber: num, participantName: name, field: 'Team', severity: 'warning', message: 'No team members added', icon: <User className="w-3.5 h-3.5" /> });
      }
    });

    return found.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return a.participantNumber - b.participantNumber;
    });
  }, [participants, participantMembers]);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  // Group by participant
  const grouped = useMemo(() => {
    const map: Record<string, CompletionIssue[]> = {};
    issues.forEach(issue => {
      const key = `${issue.participantNumber}`;
      if (!map[key]) map[key] = [];
      map[key].push(issue);
    });
    return map;
  }, [issues]);

  const completionPercentage = useMemo(() => {
    if (participants.length === 0) return 100;
    const totalChecks = participants.length * 8; // 8 checks per participant
    const passed = totalChecks - issues.length;
    return Math.max(0, Math.round((passed / totalChecks) * 100));
  }, [participants, issues]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Participant Completeness Check
          </DialogTitle>
          <DialogDescription>
            Pre-submission validation for missing participant data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Summary */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Completeness</span>
                <span className="font-bold text-primary">{completionPercentage}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-primary"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              {errorCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" /> {errorCount}
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                  <AlertTriangle className="w-3 h-3" /> {warningCount}
                </Badge>
              )}
            </div>
          </div>

          {issues.length === 0 ? (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
              <CardContent className="pt-6 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">All participants complete</p>
                  <p className="text-sm text-green-600 dark:text-green-500">All required fields are filled for {participants.length} participant(s).</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="flex-1 max-h-[450px]">
              <div className="space-y-4 pr-4">
                {Object.entries(grouped).map(([pNum, pIssues]) => {
                  const first = pIssues[0];
                  return (
                    <div key={pNum} className="space-y-1.5">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span>P{first.participantNumber} – {first.participantName}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                          {pIssues.length} issue{pIssues.length !== 1 ? 's' : ''}
                        </Badge>
                      </h4>
                      {pIssues.map((issue, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${
                            issue.severity === 'error'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                          }`}
                        >
                          {issue.icon}
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
