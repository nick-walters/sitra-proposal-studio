import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, Link2, BookOpen } from 'lucide-react';
import { ParticipantDependency, LINK_TYPES } from '@/types/participantDetails';
import { ParticipantSummary } from '@/types/proposal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DependenciesSectionProps {
  dependencies: ParticipantDependency[];
  participants: ParticipantSummary[];
  currentParticipantId: string;
  onAdd: (dependency: Omit<ParticipantDependency, 'id' | 'createdAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantDependency>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

export function DependenciesSection({
  dependencies,
  participants,
  currentParticipantId,
  onAdd,
  onUpdate,
  onDelete,
  canEdit,
}: DependenciesSectionProps) {
  const otherParticipants = participants.filter(p => p.id !== currentParticipantId);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  const handleAddRow = () => {
    onAdd({
      participantId: currentParticipantId,
      linkedParticipantId: otherParticipants[0]?.id || undefined,
      linkType: 'Same group',
    });
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
          </div>
          <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0 border-destructive text-destructive hover:bg-destructive/10">
                <BookOpen className="w-4 h-4" />
                Guidelines
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Dependency Guidelines
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Two participants (legal entities) are dependent on each other where there is a controlling relationship between them:
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>A legal entity is under the same direct or indirect control as another legal entity; or</li>
                  <li>A legal entity directly or indirectly controls another legal entity; or</li>
                  <li>A legal entity is directly or indirectly controlled by another legal entity.</li>
                </ul>
                <p className="font-medium text-foreground">Control:</p>
                <p>
                  Legal entity A controls legal entity B if:
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>A, directly or indirectly, holds more than 50% of the nominal value of the issued share capital or a majority of the voting rights of the shareholders or associates of B, or</li>
                  <li>A, directly or indirectly, holds in fact or in law the decision-making powers in B.</li>
                </ul>
                <p className="italic">
                  The following relationships between legal entities shall not in themselves be deemed to constitute controlling relationships:
                </p>
                <ol className="ml-4 list-[lower-alpha] space-y-1 italic">
                  <li>the same public investment corporation, institutional investor or venture-capital company has a direct or indirect holding of more than 50% of the nominal value of the issued share capital or a majority of voting rights of the shareholders or associates;</li>
                  <li>the legal entities concerned are owned or supervised by the same public body.</li>
                </ol>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dependencies.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Participant</TableHead>
                  <TableHead className="w-[40%]">Type of link</TableHead>
                  {canEdit && <TableHead className="w-[10%]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dependencies.map((dep) => (
                  <TableRow key={dep.id}>
                    <TableCell>
                      {canEdit ? (
                        <Select
                          value={dep.linkedParticipantId || ''}
                          onValueChange={(v) => onUpdate(dep.id, { linkedParticipantId: v })}
                        >
                          <SelectTrigger className="w-full">
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
                      ) : (
                        <span className="text-sm">
                          {dep.linkedParticipantId
                            ? (() => {
                                const p = participants.find(x => x.id === dep.linkedParticipantId);
                                return p
                                  ? `${p.participant_number ? `${p.participant_number}. ` : ''}${p.organisation_short_name || p.organisation_name}`
                                  : 'Unknown';
                              })()
                            : 'Unspecified'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Select
                          value={dep.linkType}
                          onValueChange={(v) => onUpdate(dep.id, { linkType: v })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LINK_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{dep.linkType}</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => onDelete(dep.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {canEdit && otherParticipants.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Link
          </Button>
        )}

        {dependencies.length === 0 && !canEdit && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No dependencies declared.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
