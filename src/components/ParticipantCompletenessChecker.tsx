import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  MapPin,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isEligibleForGEP } from '@/lib/countries';

interface ParticipantCompletenessCheckerProps {
  proposalId: string;
}

interface CompletionIssue {
  participantNumber: number;
  participantName: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
  icon: React.ReactNode;
}

export function ParticipantCompletenessChecker({ proposalId }: ParticipantCompletenessCheckerProps) {
  const [issues, setIssues] = useState<CompletionIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  const runCheck = async () => {
    setLoading(true);
    try {
      const { data: participants } = await supabase
        .from('participants')
        .select('*')
        .eq('proposal_id', proposalId) as any;
      const { data: members } = await supabase
        .from('participant_members')
        .select('participant_id')
        .in('participant_id', (participants || []).map((p: any) => p.id)) as any;

      const parts = participants || [];
      const mems = members || [];
      setParticipantCount(parts.length);
      const found: CompletionIssue[] = [];

      parts.forEach(p => {
        const name = p.organisation_short_name || p.organisation_name || `Participant ${p.participant_number}`;
        const num = p.participant_number;

        if (!p.organisation_name?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'Legal name', severity: 'error', message: 'Legal name is required', icon: <Building2 className="w-3.5 h-3.5" /> });
        if (!p.organisation_short_name?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'Short name', severity: 'error', message: 'Short name is required', icon: <Hash className="w-3.5 h-3.5" /> });
        if (!p.country?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'Country', severity: 'error', message: 'Country is required', icon: <Globe className="w-3.5 h-3.5" /> });
        if (!p.legal_entity_type?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'Legal entity type', severity: 'error', message: 'Legal entity type is required', icon: <FileText className="w-3.5 h-3.5" /> });
        if (!p.pic_number?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'PIC', severity: 'warning', message: 'PIC number is missing', icon: <Hash className="w-3.5 h-3.5" /> });
        if (!p.contact_email?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'Email', severity: 'warning', message: 'Contact email is missing', icon: <Mail className="w-3.5 h-3.5" /> });
        if (!p.main_contact_first_name?.trim() && !p.main_contact_last_name?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'Contact person', severity: 'warning', message: 'Main contact person is missing', icon: <User className="w-3.5 h-3.5" /> });
        if (!p.street?.trim() || !p.town?.trim() || !p.postcode?.trim())
          found.push({ participantNumber: num, participantName: name, field: 'Address', severity: 'warning', message: 'Address is incomplete', icon: <MapPin className="w-3.5 h-3.5" /> });

        const gepEligible = ['HES', 'RES', 'PUB'].includes(p.organisation_category || '') && isEligibleForGEP(p.country || '');
        if (gepEligible) {
          found.push({ participantNumber: num, participantName: name, field: 'GEP', severity: 'warning', message: 'Ensure Gender Equality Plan is provided', icon: <FileText className="w-3.5 h-3.5" /> });
        }

        const memberCount = mems.filter(m => m.participant_id === p.id).length;
        if (memberCount === 0)
          found.push({ participantNumber: num, participantName: name, field: 'Team', severity: 'warning', message: 'No team members added', icon: <User className="w-3.5 h-3.5" /> });
      });

      found.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
        return a.participantNumber - b.participantNumber;
      });

      setIssues(found);
      setHasRun(true);
      if (found.length === 0) toast.success('All participants complete!');
      else toast.info(`Found ${found.filter(i => i.severity === 'error').length} error(s) and ${found.filter(i => i.severity === 'warning').length} warning(s)`);
    } catch (error) {
      console.error('Participant check error:', error);
      toast.error('Failed to check participants');
    } finally {
      setLoading(false);
    }
  };

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

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
    if (participantCount === 0) return 100;
    const totalChecks = participantCount * 8;
    const passed = totalChecks - issues.length;
    return Math.max(0, Math.round((passed / totalChecks) * 100));
  }, [participantCount, issues]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Participant Completeness Check
          </h2>
          <p className="text-sm text-muted-foreground">Pre-submission validation for missing participant data</p>
        </div>
        <Button onClick={runCheck} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {hasRun ? 'Re-check' : 'Run check'}
        </Button>
      </div>

      {!hasRun && !loading && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Click "Run check" to validate participant data</p>
          </CardContent>
        </Card>
      )}

      {hasRun && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Completeness</span>
                <span className="font-bold text-primary">{completionPercentage}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${completionPercentage}%` }} />
              </div>
            </div>
            <div className="flex gap-2">
              {errorCount > 0 && <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> {errorCount}</Badge>}
              {warningCount > 0 && <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600"><AlertTriangle className="w-3 h-3" /> {warningCount}</Badge>}
            </div>
          </div>

          {issues.length === 0 ? (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
              <CardContent className="pt-6 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">All participants complete</p>
                  <p className="text-sm text-green-600 dark:text-green-500">All required fields are filled for {participantCount} participant(s).</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-4 pr-4">
                {Object.entries(grouped).map(([pNum, pIssues]) => {
                  const first = pIssues[0];
                  return (
                    <div key={pNum} className="space-y-1.5">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        P{first.participantNumber} – {first.participantName}
                        <Badge variant="outline" className="text-[10px] ml-auto">{pIssues.length} issue{pIssues.length !== 1 ? 's' : ''}</Badge>
                      </h4>
                      {pIssues.map((issue, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${
                            issue.severity === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
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
        </>
      )}
    </div>
  );
}
