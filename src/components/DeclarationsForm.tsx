import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Participant } from '@/types/proposal';
import { FileCheck, Building2, Save, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';

interface PartAData {
  id: string;
  participantId: string;
  declarations: string | null;
  previousProposals: string | null;
  dependencies: string | null;
  resources: string | null;
}

interface DeclarationsFormProps {
  participants: Participant[];
  proposalId: string;
  canEdit: boolean;
}

// Standard EU declarations
const DECLARATIONS = [
  {
    id: 'truthfulness',
    title: 'Truthfulness',
    text: 'I declare that the information provided in this application is accurate and complete to the best of my knowledge.',
  },
  {
    id: 'no_exclusion',
    title: 'No Exclusion',
    text: 'I declare that our organisation is not in any exclusion situation as defined in Articles 136 and 141 of the EU Financial Regulation.',
  },
  {
    id: 'financial_capacity',
    title: 'Financial Capacity',
    text: 'I declare that our organisation has the financial and operational capacity to carry out the proposed work.',
  },
  {
    id: 'no_conflict',
    title: 'No Conflict of Interest',
    text: 'I declare that there is no conflict of interest in connection with this proposal.',
  },
  {
    id: 'data_protection',
    title: 'Data Protection',
    text: 'I declare that personal data processing complies with Regulation (EU) 2018/1725 and GDPR.',
  },
  {
    id: 'ethics_compliance',
    title: 'Ethics Compliance',
    text: 'I declare that the activities will comply with ethical principles and relevant legislation.',
  },
  {
    id: 'double_funding',
    title: 'No Double Funding',
    text: 'I declare that this proposal has not been submitted for funding elsewhere, except where explicitly stated.',
  },
  {
    id: 'ownership',
    title: 'Ownership & Control',
    text: 'I declare that the ownership and control information provided is accurate and up-to-date.',
  },
];

export function DeclarationsForm({ participants, proposalId, canEdit }: DeclarationsFormProps) {
  const [partAData, setPartAData] = useState<Record<string, PartAData>>({});
  const [declarations, setDeclarations] = useState<Record<string, Record<string, boolean>>>({});
  const [additionalInfo, setAdditionalInfo] = useState<Record<string, { previous: string; dependencies: string; resources: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPartAData();
  }, [proposalId, participants]);

  const fetchPartAData = async () => {
    if (!participants.length) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('part_a_data')
        .select('*')
        .in('participant_id', participants.map(p => p.id));

      if (error) throw error;

      const dataMap: Record<string, PartAData> = {};
      const declMap: Record<string, Record<string, boolean>> = {};
      const infoMap: Record<string, { previous: string; dependencies: string; resources: string }> = {};

      participants.forEach(p => {
        const existing = data?.find(d => d.participant_id === p.id);
        if (existing) {
          dataMap[p.id] = {
            id: existing.id,
            participantId: existing.participant_id,
            declarations: existing.declarations,
            previousProposals: existing.previous_proposals,
            dependencies: existing.dependencies,
            resources: existing.resources,
          };
          
          // Parse declarations JSON
          try {
            declMap[p.id] = existing.declarations ? JSON.parse(existing.declarations) : {};
          } catch {
            declMap[p.id] = {};
          }
          
          infoMap[p.id] = {
            previous: existing.previous_proposals || '',
            dependencies: existing.dependencies || '',
            resources: existing.resources || '',
          };
        } else {
          declMap[p.id] = {};
          infoMap[p.id] = { previous: '', dependencies: '', resources: '' };
        }
      });

      setPartAData(dataMap);
      setDeclarations(declMap);
      setAdditionalInfo(infoMap);
    } catch (error) {
      console.error('Error fetching Part A data:', error);
      toast.error('Failed to load declarations');
    } finally {
      setLoading(false);
    }
  };

  const handleDeclarationChange = (participantId: string, declarationId: string, checked: boolean) => {
    setDeclarations(prev => ({
      ...prev,
      [participantId]: {
        ...prev[participantId],
        [declarationId]: checked,
      },
    }));
  };

  const handleInfoChange = (participantId: string, field: 'previous' | 'dependencies' | 'resources', value: string) => {
    setAdditionalInfo(prev => ({
      ...prev,
      [participantId]: {
        ...prev[participantId],
        [field]: value,
      },
    }));
  };

  const saveParticipantDeclarations = async (participantId: string) => {
    setSaving(prev => ({ ...prev, [participantId]: true }));
    
    try {
      const existing = partAData[participantId];
      const declJson = JSON.stringify(declarations[participantId] || {});
      const info = additionalInfo[participantId] || { previous: '', dependencies: '', resources: '' };

      if (existing) {
        const { error } = await supabase
          .from('part_a_data')
          .update({
            declarations: declJson,
            previous_proposals: info.previous,
            dependencies: info.dependencies,
            resources: info.resources,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('part_a_data')
          .insert({
            participant_id: participantId,
            declarations: declJson,
            previous_proposals: info.previous,
            dependencies: info.dependencies,
            resources: info.resources,
          });

        if (error) throw error;
      }

      toast.success('Declarations saved');
      fetchPartAData();
    } catch (error) {
      console.error('Error saving declarations:', error);
      toast.error('Failed to save declarations');
    } finally {
      setSaving(prev => ({ ...prev, [participantId]: false }));
    }
  };

  const getCompletionStatus = (participantId: string) => {
    const decls = declarations[participantId] || {};
    const completed = DECLARATIONS.filter(d => decls[d.id]).length;
    return { completed, total: DECLARATIONS.length };
  };

  if (loading) {
    return (
      <div className="flex-1 p-6 bg-muted/30">
        <div className="max-w-7xl mx-auto flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Guidelines and Save */}
        <div className="flex items-center gap-3">
          <PartAGuidelinesDialog
            sectionTitle="Part A5: Declarations"
            officialGuidelines={[{
              id: 'declarations-info',
              title: 'Declaration requirements',
              content: 'These declarations are required by the European Commission. Each participating organisation must confirm all declarations before submission.\n\nDeclarations cover:\n• Truthfulness and accuracy of information\n• Compliance with exclusion criteria\n• Financial and operational capacity\n• Absence of conflicts of interest\n• Data protection compliance\n• Ethics compliance\n• No double funding\n• Ownership and control information'
            }]}
          />
        </div>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Part A5: Declarations</h1>
        </div>

        {participants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">No participants added yet.</p>
              <p className="text-sm text-muted-foreground/70">
                Add participants in Part A - Administrative Forms first.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" defaultValue={participants.map(p => p.id)} className="space-y-4">
            {participants.map((participant, index) => {
              const { completed, total } = getCompletionStatus(participant.id);
              const isComplete = completed === total;
              
              return (
                <AccordionItem
                  key={participant.id}
                  value={participant.id}
                  className="border rounded-lg bg-card"
                >
                  <AccordionTrigger className="px-6 hover:no-underline">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-sm font-medium">{index + 1}</span>
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{participant.organisationName}</span>
                          {participant.organisationShortName && (
                            <span className="text-muted-foreground">({participant.organisationShortName})</span>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">{participant.country}</span>
                      </div>
                      <Badge variant={isComplete ? 'default' : 'secondary'}>
                        {completed}/{total} Complete
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6">
                    <div className="space-y-6">
                      {/* Declarations Checkboxes */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Required Declarations</CardTitle>
                          <CardDescription>
                            Confirm each declaration on behalf of {participant.organisationShortName || participant.organisationName}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {DECLARATIONS.map((decl) => (
                            <div key={decl.id} className="flex items-start gap-3">
                              <Checkbox
                                id={`${participant.id}-${decl.id}`}
                                checked={declarations[participant.id]?.[decl.id] || false}
                                onCheckedChange={(checked) =>
                                  handleDeclarationChange(participant.id, decl.id, checked as boolean)
                                }
                                disabled={!canEdit}
                              />
                              <div className="flex-1">
                                <Label
                                  htmlFor={`${participant.id}-${decl.id}`}
                                  className="font-medium cursor-pointer"
                                >
                                  {decl.title}
                                </Label>
                                <p className="text-sm text-muted-foreground mt-0.5">{decl.text}</p>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      {/* Additional Information */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Additional Information</CardTitle>
                          <CardDescription>
                            Provide any relevant additional information
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor={`${participant.id}-previous`}>
                              Previous Proposals
                            </Label>
                            <Textarea
                              id={`${participant.id}-previous`}
                              placeholder="List any previous proposals related to this work..."
                              value={additionalInfo[participant.id]?.previous || ''}
                              onChange={(e) => handleInfoChange(participant.id, 'previous', e.target.value)}
                              disabled={!canEdit}
                              rows={2}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`${participant.id}-dependencies`}>
                              Dependencies
                            </Label>
                            <Textarea
                              id={`${participant.id}-dependencies`}
                              placeholder="Describe any dependencies on other projects or resources..."
                              value={additionalInfo[participant.id]?.dependencies || ''}
                              onChange={(e) => handleInfoChange(participant.id, 'dependencies', e.target.value)}
                              disabled={!canEdit}
                              rows={2}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`${participant.id}-resources`}>
                              Resources
                            </Label>
                            <Textarea
                              id={`${participant.id}-resources`}
                              placeholder="Describe available resources and infrastructure..."
                              value={additionalInfo[participant.id]?.resources || ''}
                              onChange={(e) => handleInfoChange(participant.id, 'resources', e.target.value)}
                              disabled={!canEdit}
                              rows={2}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Save Button */}
                      {canEdit && (
                        <div className="flex justify-end">
                          <Button
                            onClick={() => saveParticipantDeclarations(participant.id)}
                            disabled={saving[participant.id]}
                            className="gap-2"
                          >
                            {saving[participant.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            Save Declarations
                          </Button>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </div>
  );
}
