import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { ParticipantDependency, LINK_TYPES } from '@/types/participantDetails';
import { ParticipantSummary } from '@/types/proposal';

interface DependenciesSectionProps {
  dependencies: ParticipantDependency[];
  participants: ParticipantSummary[];
  currentParticipantId: string;
  legacyDependencyText?: string;
  onAdd: (dependency: Omit<ParticipantDependency, 'id' | 'createdAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantDependency>) => void;
  onDelete: (id: string) => void;
  onUpdateLegacyText: (text: string) => void;
  canEdit: boolean;
}

export function DependenciesSection({
  dependencies,
  participants,
  currentParticipantId,
  legacyDependencyText,
  onAdd,
  onUpdate,
  onDelete,
  onUpdateLegacyText,
  canEdit,
}: DependenciesSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDependency, setNewDependency] = useState({
    linkedParticipantId: '',
    linkType: '',
    notes: '',
  });

  // Filter out current participant from the list
  const otherParticipants = participants.filter(p => p.id !== currentParticipantId);

  const handleAdd = () => {
    if (!newDependency.linkType) return;

    onAdd({
      participantId: currentParticipantId,
      linkedParticipantId: newDependency.linkedParticipantId || undefined,
      linkType: newDependency.linkType,
      notes: newDependency.notes || undefined,
    });

    setNewDependency({
      linkedParticipantId: '',
      linkType: '',
      notes: '',
    });
    setShowAddForm(false);
  };

  const getParticipantName = (id: string | undefined) => {
    if (!id) return 'Unspecified';
    const participant = participants.find(p => p.id === id);
    return participant?.organisation_short_name || participant?.organisation_name || 'Unknown';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Links with other participants
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Please indicate if there are dependencies with other participants of the proposal.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Two participants (legal entities) are dependent on each other where there is a controlling relationship between them:
            </p>
            <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc space-y-1">
              <li>A legal entity is under the same direct or indirect control as another legal entity; or</li>
              <li>A legal entity directly or indirectly controls another legal entity; or</li>
              <li>A legal entity is directly or indirectly controlled by another legal entity.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2 font-medium">Control:</p>
            <p className="text-sm text-muted-foreground mt-1">
              Legal entity A controls legal entity B if:
            </p>
            <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc space-y-1">
              <li>A, directly or indirectly, holds more than 50% of the nominal value of the issued share capital or a majority of the voting rights of the shareholders or associates of B, or</li>
              <li>A, directly or indirectly, holds in fact or in law the decision-making powers in B.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2 italic">
              The following relationships between legal entities shall not in themselves be deemed to constitute controlling relationships:
            </p>
            <ol className="text-sm text-muted-foreground mt-1 ml-4 list-[lower-alpha] space-y-1 italic">
              <li>the same public investment corporation, institutional investor or venture-capital company has a direct or indirect holding of more than 50% of the nominal value of the issued share capital or a majority of voting rights of the shareholders or associates;</li>
              <li>the legal entities concerned are owned or supervised by the same public body.</li>
            </ol>
          </div>
          {canEdit && otherParticipants.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Link
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        {showAddForm && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Link type *</Label>
                  <Select
                    value={newDependency.linkType}
                    onValueChange={(v) => setNewDependency({ ...newDependency, linkType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Linked participant</Label>
                  <Select
                    value={newDependency.linkedParticipantId}
                    onValueChange={(v) => setNewDependency({ ...newDependency, linkedParticipantId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select participant" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherParticipants.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.participant_number ? `${p.participant_number}. ` : ''}
                          {p.organisation_short_name || p.organisation_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={newDependency.notes}
                  onChange={(e) => setNewDependency({ ...newDependency, notes: e.target.value })}
                  placeholder="Additional details about the relationship..."
                  className="min-h-[60px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={!newDependency.linkType}>
                  Add Link
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dependencies List */}
        {dependencies.length > 0 && (
          <div className="space-y-2">
            {dependencies.map((dep) => (
              <div
                key={dep.id}
                className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
              >
                <Link2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{dep.linkType}</span>
                    {dep.linkedParticipantId && (
                      <> with <span className="font-medium">{getParticipantName(dep.linkedParticipantId)}</span></>
                    )}
                  </p>
                  {dep.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{dep.notes}</p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(dep.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Legacy text area for additional notes */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Additional notes</Label>
          <Textarea
            value={legacyDependencyText || ''}
            onChange={(e) => onUpdateLegacyText(e.target.value)}
            placeholder="Describe any other dependencies or relationships not captured above..."
            className="min-h-[80px]"
            disabled={!canEdit}
          />
        </div>

        {dependencies.length === 0 && !legacyDependencyText && !showAddForm && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No links declared. Add structured links or use the notes field above.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
