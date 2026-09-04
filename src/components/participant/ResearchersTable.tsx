import { useEffect, useRef, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Users, HelpCircle, BookOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ParticipantResearcher,
  CAREER_STAGES,
  CONTACT_TITLES,
  GENDER_OPTIONS,
  IDENTIFIER_TYPES,
} from '@/types/participantDetails';
import { CountrySelect } from '@/components/CountrySelect';

const RESEARCHER_ROLES = ['Leading', 'Team member'] as const;

interface ResearchersTableProps {
  researchers: ParticipantResearcher[];
  onAdd: (researcher: Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantResearcher>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

export function ResearchersTable({
  researchers,
  onAdd,
  onUpdate,
  onDelete,
  canEdit,
}: ResearchersTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [newResearcher, setNewResearcher] = useState({
    title: '',
    firstName: '',
    lastName: '',
    gender: '',
    nationality: '',
    email: '',
    careerStage: '',
    roleInProject: '',
    referenceIdentifier: '',
    identifierType: '',
  });

  const handleAdd = () => {
    if (!newResearcher.firstName.trim() || !newResearcher.lastName.trim()) {
      return;
    }

    onAdd({
      ...newResearcher,
      participantId: '',
      orderIndex: researchers.length,
    });

    setNewResearcher({
      title: '',
      firstName: '',
      lastName: '',
      gender: '',
      nationality: '',
      email: '',
      careerStage: '',
      roleInProject: '',
      referenceIdentifier: '',
      identifierType: '',
    });
    setShowAddForm(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Researchers involved in the proposal
            </CardTitle>
            <CardDescription className="mt-1">
              List of researchers who will be involved in the project activities
            </CardDescription>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Researcher
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        {showAddForm && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Select
                    value={newResearcher.title}
                    onValueChange={(v) => setNewResearcher({ ...newResearcher, title: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_TITLES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input
                    value={newResearcher.firstName}
                    onChange={(e) => setNewResearcher({ ...newResearcher, firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input
                    value={newResearcher.lastName}
                    onChange={(e) => setNewResearcher({ ...newResearcher, lastName: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select
                    value={newResearcher.gender}
                    onValueChange={(v) => setNewResearcher({ ...newResearcher, gender: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nationality</Label>
                  <CountrySelect
                    value={newResearcher.nationality}
                    onValueChange={(v) => setNewResearcher({ ...newResearcher, nationality: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={newResearcher.email}
                    onChange={(e) => setNewResearcher({ ...newResearcher, email: e.target.value })}
                    placeholder="researcher@university.eu"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Career Stage
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" className="text-destructive hover:text-destructive/80">
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            Career stage Definitions
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                          <p className="text-muted-foreground">Career stages as defined in Frascati 2015 manual:</p>
                          <div className="space-y-3">
                            <div>
                              <p className="font-semibold">Category A – Top grade researcher</p>
                              <p className="text-muted-foreground">The single highest grade/post at which research is normally conducted. Example: 'Full professor' or 'Director of research'.</p>
                            </div>
                            <div>
                              <p className="font-semibold">Category B – Senior researcher</p>
                              <p className="text-muted-foreground">Researchers working in positions not as senior as top position but more senior than newly qualified doctoral graduates (ISCED level 8). Examples: 'associate professor' or 'senior researcher' or 'principal investigator'.</p>
                            </div>
                            <div>
                              <p className="font-semibold">Category C – Recognised researcher</p>
                              <p className="text-muted-foreground">The first grade/post into which a newly qualified doctoral graduate would normally be recruited. Examples: 'assistant professor', 'investigator' or 'postdoctoral fellow'.</p>
                            </div>
                            <div>
                              <p className="font-semibold">Category D – First stage researcher</p>
                              <p className="text-muted-foreground">Either doctoral students at the ISCED level 8 who are engaged as researchers, or researchers working in posts that do not normally require a doctorate degree. Examples: 'PhD students' or 'junior researchers' (without a PhD).</p>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </Label>
                  <Select
                    value={newResearcher.careerStage}
                    onValueChange={(v) => setNewResearcher({ ...newResearcher, careerStage: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAREER_STAGES.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Role of researcher (in the project)</Label>
                  <Select
                    value={newResearcher.roleInProject}
                    onValueChange={(v) => setNewResearcher({ ...newResearcher, roleInProject: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESEARCHER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reference Identifier</Label>
                  <Input
                    value={newResearcher.referenceIdentifier}
                    onChange={(e) => setNewResearcher({ ...newResearcher, referenceIdentifier: e.target.value })}
                    placeholder="e.g., 0000-0001-2345-6789"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type of identifier</Label>
                  <Select
                    value={newResearcher.identifierType}
                    onValueChange={(v) => setNewResearcher({ ...newResearcher, identifierType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {IDENTIFIER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={!newResearcher.firstName.trim() || !newResearcher.lastName.trim()}>
                  Add Researcher
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Researchers */}
        {researchers.length === 0 && !showAddForm ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No researchers added yet</p>
            <p className="text-xs mt-1">Add researchers who will be involved in the project</p>
          </div>
        ) : researchers.length > 0 && (
          <div className="space-y-3">
            {researchers.map((researcher) => (
              <div key={researcher.id} className="min-w-0 rounded-md border p-3">
                <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">
                    {researcher.firstName} {researcher.lastName}
                  </p>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm({ id: researcher.id, name: `${researcher.firstName} ${researcher.lastName}` })}
                      aria-label="Delete researcher"
                      title="Delete researcher"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
                  <ResearcherField label="Title" value={researcher.title}>
                    {canEdit && (
                      <Select value={researcher.title || undefined} onValueChange={(v) => onUpdate(researcher.id, { title: v })}>
                        <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {CONTACT_TITLES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </ResearcherField>
                  <ResearcherField label="First Name" value={researcher.firstName}>
                    {canEdit && <DebouncedCell value={researcher.firstName} placeholder="First Name" onCommit={(v) => { if (v.trim()) onUpdate(researcher.id, { firstName: v.trim() }); }} />}
                  </ResearcherField>
                  <ResearcherField label="Last Name" value={researcher.lastName}>
                    {canEdit && <DebouncedCell value={researcher.lastName} placeholder="Last Name" onCommit={(v) => { if (v.trim()) onUpdate(researcher.id, { lastName: v.trim() }); }} />}
                  </ResearcherField>
                  <ResearcherField label="Gender" value={researcher.gender}>
                    {canEdit && (
                      <Select value={researcher.gender || undefined} onValueChange={(v) => onUpdate(researcher.id, { gender: v })}>
                        <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </ResearcherField>
                  <ResearcherField label="Nationality" value={researcher.nationality}>
                    {canEdit && <CountrySelect value={researcher.nationality || ''} onValueChange={(v) => onUpdate(researcher.id, { nationality: v })} />}
                  </ResearcherField>

                  <ResearcherField label="E-mail" value={researcher.email}>
                    {canEdit && <DebouncedCell value={researcher.email || ''} placeholder="E-mail" type="email" onCommit={(v) => onUpdate(researcher.id, { email: v })} />}
                  </ResearcherField>
                  <ResearcherField label="Career Stage" value={researcher.careerStage}>
                    {canEdit && (
                      <Select value={researcher.careerStage || undefined} onValueChange={(v) => onUpdate(researcher.id, { careerStage: v })}>
                        <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {CAREER_STAGES.map((stage) => <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </ResearcherField>
                  <ResearcherField label="Role of researcher (in the project)" value={researcher.roleInProject}>
                    {canEdit && (
                      <Select
                        value={RESEARCHER_ROLES.includes(researcher.roleInProject as typeof RESEARCHER_ROLES[number]) ? researcher.roleInProject : undefined}
                        onValueChange={(v) => onUpdate(researcher.id, { roleInProject: v })}
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue placeholder={researcher.roleInProject || 'Select role'} />
                        </SelectTrigger>
                        <SelectContent>
                          {RESEARCHER_ROLES.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </ResearcherField>
                  <ResearcherField label="Reference Identifier" value={researcher.referenceIdentifier}>
                    {canEdit && <DebouncedCell value={researcher.referenceIdentifier || ''} placeholder="Reference Identifier" onCommit={(v) => onUpdate(researcher.id, { referenceIdentifier: v })} />}
                  </ResearcherField>
                  <ResearcherField label="Type of identifier" value={researcher.identifierType}>
                    {canEdit && (
                      <Select value={researcher.identifierType || undefined} onValueChange={(v) => onUpdate(researcher.id, { identifierType: v })}>
                        <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {IDENTIFIER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </ResearcherField>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Researcher Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove researcher?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove <strong>{deleteConfirm?.name}</strong> from the researchers list? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteConfirm) {
                    onDelete(deleteConfirm.id);
                    setDeleteConfirm(null);
                  }
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function ResearcherField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="block min-h-8 text-xs leading-4">{label}</Label>
      {children ?? <p className="min-h-8 break-words text-sm">{value || '—'}</p>}
    </div>
  );
}

/**
 * Editable child-row cell: local state while typing, a 350 ms trailing commit
 * plus a commit on blur. The server value is only reseeded when the field is
 * unfocused and has nothing pending, so a slow write can never yank text out
 * from under the cursor.
 */
function DebouncedCell({
  value,
  onCommit,
  placeholder,
  type = 'text',
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const [local, setLocal] = useState(value ?? '');
  const focusedRef = useRef(false);
  const pendingRef = useRef(false);

  const { push, flush } = useDebouncedSave<string>((v) => {
    pendingRef.current = false;
    onCommit(v);
  }, 350);

  useEffect(() => {
    if (!focusedRef.current && !pendingRef.current) {
      setLocal(value ?? '');
    }
  }, [value]);

  return (
    <Input
      className="h-8 text-xs"
      type={type}
      placeholder={placeholder}
      value={local}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => {
        setLocal(e.target.value);
        pendingRef.current = true;
        push(e.target.value);
      }}
      onBlur={() => {
        focusedRef.current = false;
        flush();
      }}
    />
  );
}
