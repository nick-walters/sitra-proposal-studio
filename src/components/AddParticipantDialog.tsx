import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Building2, ChevronsUpDown, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PARTICIPANT_TYPE_LABELS, ParticipantType, OrganisationCategory } from '@/types/proposal';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface RegistryOrg {
  id: string;
  name: string;
  short_name: string | null;
  english_name: string | null;
  pic_number: string;
  country: string | null;
  logo_url: string | null;
  organisation_category: string | null;
}

interface AddParticipantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddParticipant: (participant: {
    organisationName: string;
    organisationShortName?: string;
    organisationType: ParticipantType;
    country?: string;
    picNumber?: string;
    legalEntityType?: string;
    organisationCategory?: OrganisationCategory;
    englishName?: string;
    logoUrl?: string;
  }) => Promise<void>;
  participantCount: number;
  existingPics?: string[];
}

export function AddParticipantDialog({
  open,
  onOpenChange,
  onAddParticipant,
  participantCount,
  existingPics = [],
}: AddParticipantDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgs, setOrgs] = useState<RegistryOrg[]>([]);
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<RegistryOrg | null>(null);
  const [participantType, setParticipantType] = useState<ParticipantType>('beneficiary');
  const [search, setSearch] = useState('');

  // Load registry on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingOrgs(true);
      const { data, error } = await supabase
        .from('organisations')
        .select('id, name, short_name, english_name, pic_number, country, logo_url, organisation_category')
        .order('name');
      if (cancelled) return;
      if (error) {
        toast.error('Failed to load organisation registry');
        setOrgs([]);
      } else {
        setOrgs((data as RegistryOrg[]) ?? []);
      }
      setLoadingOrgs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const existingPicSet = useMemo(
    () => new Set(existingPics.map((p) => p?.trim()).filter(Boolean)),
    [existingPics]
  );

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => {
      return (
        o.name?.toLowerCase().includes(q) ||
        o.short_name?.toLowerCase().includes(q) ||
        o.english_name?.toLowerCase().includes(q) ||
        o.pic_number?.toLowerCase().includes(q)
      );
    });
  }, [orgs, search]);

  const logoUrlFor = (path: string | null): string | null => {
    if (!path) return null;
    const { data } = supabase.storage.from('participant-logos').getPublicUrl(path);
    return data?.publicUrl ?? null;
  };

  const isDuplicate = selectedOrg ? existingPicSet.has(selectedOrg.pic_number?.trim()) : false;

  const handleAdd = async () => {
    if (!selectedOrg || isDuplicate) return;
    setLoading(true);
    try {
      await onAddParticipant({
        organisationName: selectedOrg.name,
        organisationShortName: selectedOrg.short_name || undefined,
        englishName: selectedOrg.english_name || undefined,
        organisationType: participantType,
        country: selectedOrg.country || undefined,
        picNumber: selectedOrg.pic_number,
        organisationCategory: (selectedOrg.organisation_category as OrganisationCategory) || undefined,
        logoUrl: selectedOrg.logo_url || undefined,
      });
      toast.success('Participant added successfully');
      handleClose();
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.toLowerCase().includes('duplicate') || msg.includes('idx_participants_proposal_pic') || err?.code === '23505') {
        toast.error('This organisation is already in this proposal');
      } else {
        toast.error('Failed to add participant');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedOrg(null);
    setParticipantType('beneficiary');
    setSearch('');
    setOrgPopoverOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Add participant #{participantCount + 1}
          </DialogTitle>
          <DialogDescription>
            Select an organisation from the platform registry, then choose its participant type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Step 1: Select organisation */}
          {!selectedOrg && (
            <div className="space-y-2">
              <Label>Organisation</Label>
              <Popover open={orgPopoverOpen} onOpenChange={setOrgPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={orgPopoverOpen}
                    className="w-full justify-between font-normal h-auto py-2"
                    disabled={loadingOrgs}
                  >
                    <span className="text-muted-foreground">
                      {loadingOrgs ? 'Loading registry…' : 'Select organisation from registry'}
                    </span>
                    {loadingOrgs ? (
                      <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
                    ) : (
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[520px] p-0 z-50 bg-popover" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by name, short name, English name or PIC…"
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList className="max-h-72 overflow-y-auto">
                      <CommandEmpty>No organisations found.</CommandEmpty>
                      <CommandGroup>
                        {filteredOrgs.map((org) => {
                          const logo = logoUrlFor(org.logo_url);
                          const alreadyIn = existingPicSet.has(org.pic_number?.trim());
                          return (
                            <CommandItem
                              key={org.id}
                              value={org.id}
                              onSelect={() => {
                                setSelectedOrg(org);
                                setOrgPopoverOpen(false);
                              }}
                              className="flex items-center gap-3 py-2"
                            >
                              <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded bg-muted overflow-hidden">
                                {logo ? (
                                  <img src={logo} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="truncate text-sm">{org.name}</div>
                                {org.english_name && org.english_name !== org.name && (
                                  <div className="truncate text-xs text-muted-foreground">{org.english_name}</div>
                                )}
                              </div>
                              <div className="text-xs font-mono text-muted-foreground tabular-nums flex-shrink-0">
                                {org.pic_number}
                                {alreadyIn && <span className="ml-1 text-amber-600">·in proposal</span>}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <p className="text-xs text-muted-foreground">
                Can't find the organisation?{' '}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => window.open('/admin/organisations', '_blank')}
                >
                  Add it to the registry first
                  <ExternalLink className="inline w-3 h-3 ml-0.5 align-text-top" />
                </button>
              </p>
            </div>
          )}

          {/* Step 2: Selected org summary + participant type */}
          {selectedOrg && (
            <>
              <div className="rounded-md border p-3 flex items-center gap-3">
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded bg-muted overflow-hidden">
                  {logoUrlFor(selectedOrg.logo_url) ? (
                    <img src={logoUrlFor(selectedOrg.logo_url)!} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{selectedOrg.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">PIC {selectedOrg.pic_number}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(null)}>
                  Change
                </Button>
              </div>

              {isDuplicate && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    This organisation is already a participant in this proposal.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label>Participant type</Label>
                <Select value={participantType} onValueChange={(v) => setParticipantType(v as ParticipantType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PARTICIPANT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedOrg || isDuplicate || loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add participant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
