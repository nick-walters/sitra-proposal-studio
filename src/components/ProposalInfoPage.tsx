import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Proposal, Participant, ParticipantMember, PARTICIPANT_TYPE_LABELS, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_TYPE_LABELS } from '@/types/proposal';
import {
  ExternalLink,
  Calendar,
  Euro,
  Users,
  Building2,
  MapPin,
  Mail,
  Clock,
  FileText,
  Image,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProposalInfoPageProps {
  proposal: Proposal;
  participants: Participant[];
  participantMembers: ParticipantMember[];
  onUpdateProposal: (updates: Partial<Proposal>) => void;
  canEdit: boolean;
}

export function ProposalInfoPage({
  proposal,
  participants,
  participantMembers,
  onUpdateProposal,
  canEdit,
}: ProposalInfoPageProps) {
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false);

  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal.destination);

  const handleGenerateLogo = async () => {
    setIsGeneratingLogo(true);
    try {
      const keywords = proposal.title.split(' ').slice(0, 5).join(', ');
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt: `Simple, modern, minimalist logo for a research project called "${proposal.acronym}". Keywords: ${keywords}. Clean design, professional, suitable for EU funding proposal.`
        }
      });

      if (error) throw error;
      if (data?.imageUrl) {
        onUpdateProposal({ logoUrl: data.imageUrl });
        toast.success('Logo generated successfully');
      }
    } catch (error) {
      console.error('Failed to generate logo:', error);
      toast.error('Failed to generate logo');
    } finally {
      setIsGeneratingLogo(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Proposal Information</h1>
            <p className="text-muted-foreground">Overview and consortium summary</p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {proposal.acronym}
          </Badge>
        </div>

        {/* Project Logo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              Project Logo
            </CardTitle>
            <CardDescription>
              Upload or generate a logo for your project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-6">
              <div className="w-32 h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/50 overflow-hidden">
                {proposal.logoUrl ? (
                  <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-contain" />
                ) : (
                  <FileText className="w-12 h-12 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 space-y-3">
                {canEdit && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="logoUrl">Logo URL</Label>
                      <Input
                        id="logoUrl"
                        placeholder="https://..."
                        value={proposal.logoUrl || ''}
                        onChange={(e) => onUpdateProposal({ logoUrl: e.target.value })}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleGenerateLogo}
                      disabled={isGeneratingLogo}
                      className="gap-2"
                    >
                      {isGeneratingLogo ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Auto-generate from keywords
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Work Programme & Destination */}
        <Card>
          <CardHeader>
            <CardTitle>Work Programme & Destination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {workProgramme && (
              <div>
                <Label className="text-muted-foreground">Work Programme</Label>
                <p className="font-medium">{workProgramme.fullName} ({workProgramme.abbreviation})</p>
              </div>
            )}
            {destination && (
              <div>
                <Label className="text-muted-foreground">Destination</Label>
                <p className="font-medium">{destination.fullName} ({destination.abbreviation})</p>
              </div>
            )}
            {!workProgramme && !destination && (
              <p className="text-muted-foreground">Not specified</p>
            )}
          </CardContent>
        </Card>

        {/* Topic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Topic Information
            </CardTitle>
            <CardDescription>
              Link to the Funding & Tenders Portal topic page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="topicId">Topic ID</Label>
                <Input
                  id="topicId"
                  placeholder="e.g., HORIZON-CL5-2024-D1-01"
                  value={proposal.topicId || ''}
                  onChange={(e) => onUpdateProposal({ topicId: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topicUrl">Topic URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="topicUrl"
                    placeholder="https://ec.europa.eu/..."
                    value={proposal.topicUrl || ''}
                    onChange={(e) => onUpdateProposal({ topicUrl: e.target.value })}
                    disabled={!canEdit}
                  />
                  {proposal.topicUrl && (
                    <Button variant="outline" size="icon" onClick={() => window.open(proposal.topicUrl, '_blank')}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the proposal..."
                value={proposal.description || ''}
                onChange={(e) => onUpdateProposal({ description: e.target.value })}
                disabled={!canEdit}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Key Details */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Budget</p>
                  <p className="text-lg font-semibold">
                    {proposal.totalBudget ? `€${proposal.totalBudget.toLocaleString()}` : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Deadline</p>
                  <p className="text-lg font-semibold">
                    {proposal.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Participants</p>
                  <p className="text-lg font-semibold">{participants.length} organisations</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Consortium Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Consortium Summary
            </CardTitle>
            <CardDescription>Participating organisations and their roles</CardDescription>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No participants added yet.</p>
                <p className="text-sm">Add participants in Part A - Participant Information.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {participants.map((participant, index) => {
                  const members = participantMembers.filter((m) => m.participantId === participant.id);
                  return (
                    <div key={participant.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          {participant.logoUrl ? (
                            <img src={participant.logoUrl} alt={participant.organisationName} className="w-10 h-10 object-contain" />
                          ) : (
                            <span className="text-lg font-bold text-muted-foreground">{index + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold">{participant.organisationName}</h4>
                            {participant.organisationShortName && (
                              <span className="text-muted-foreground">({participant.organisationShortName})</span>
                            )}
                            <Badge variant="secondary">{PARTICIPANT_TYPE_LABELS[participant.organisationType]}</Badge>
                            {participant.isSme && <Badge variant="outline" className="text-primary border-primary">SME</Badge>}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            {participant.country && (
                              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{participant.country}</span>
                            )}
                            {participant.contactEmail && (
                              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{participant.contactEmail}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" />Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Created:</span>
                <span>{format(proposal.createdAt, 'dd MMM yyyy')}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Last updated:</span>
                <span>{format(proposal.updatedAt, 'dd MMM yyyy, HH:mm')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
