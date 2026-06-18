import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Building2, ChevronsUpDown, Loader2, AlertTriangle, Plus, Search, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PARTICIPANT_TYPE_LABELS,
  ParticipantType,
  OrganisationCategory,
  ORGANISATION_CATEGORY_LABELS,
} from '@/types/proposal';
import { CountrySelect } from '@/components/CountrySelect';
import { supabase } from '@/integrations/supabase/client';
import {
  EU_MEMBER_STATES,
  ASSOCIATED_COUNTRIES,
  THIRD_COUNTRIES,
} from '@/lib/countries';

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

const ALL_COUNTRIES = [...EU_MEMBER_STATES, ...ASSOCIATED_COUNTRIES, ...THIRD_COUNTRIES];
const COUNTRY_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  ALL_COUNTRIES.map((c) => [c.code, c.name])
);

interface RegistryFormState {
  pic_number: string;
  name: string;
  short_name: string;
  english_name: string;
  country: string;
  organisation_category: OrganisationCategory | '';
}

const emptyRegistryForm: RegistryFormState = {
  pic_number: '',
  name: '',
  short_name: '',
  english_name: '',
  country: '',
  organisation_category: '',
};

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

  // Inline "Add to registry" dialog state
  const [registryOpen, setRegistryOpen] = useState(false);
  const [picInput, setPicInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [registryForm, setRegistryForm] = useState<RegistryFormState | null>(null);
  const [savingRegistry, setSavingRegistry] = useState(false);
  const [registryLogoFile, setRegistryLogoFile] = useState<File | null>(null);
  const [registryLogoPreview, setRegistryLogoPreview] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, short_name, english_name, pic_number, country, logo_url, organisation_category')
      .order('name');
    if (error) {
      toast.error('Failed to load organisation registry');
      setOrgs([]);
    } else {
      setOrgs((data as RegistryOrg[]) ?? []);
    }
    setLoadingOrgs(false);
  }, []);

  useEffect(() => {
    if (open) fetchOrgs();
  }, [open, fetchOrgs]);

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
    if (path.startsWith('http')) return path;
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

  // --- Registry inline dialog handlers ---
  const openRegistryDialog = () => {
    setOrgPopoverOpen(false);
    setPicInput('');
    setRegistryForm(null);
    setRegistryOpen(true);
  };

  const closeRegistryDialog = () => {
    setRegistryOpen(false);
    setPicInput('');
    setRegistryForm(null);
  };

  const handleLookup = async () => {
    const pic = picInput.trim();
    if (!/^\d{9}$/.test(pic)) return;

    // Pre-check existing in registry
    const existing = orgs.find((o) => o.pic_number === pic);
    if (existing) {
      toast.info('This PIC is already in the registry');
      closeRegistryDialog();
      setSelectedOrg(existing);
      return;
    }

    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-pic', {
        body: { picNumber: pic },
      });
      if (error || !data?.success || !data.organisation) {
        toast.info('No public record found. Enter details manually.');
        setRegistryForm({ ...emptyRegistryForm, pic_number: pic });
        return;
      }
      const org = data.organisation;
      const countryName =
        (org.countryCode && COUNTRY_CODE_TO_NAME[org.countryCode]) || '';
      const cat: OrganisationCategory | '' =
        org.organisationCategory && org.organisationCategory in ORGANISATION_CATEGORY_LABELS
          ? org.organisationCategory
          : '';
      setRegistryForm({
        pic_number: pic,
        name: org.legalName || '',
        short_name: org.shortName || '',
        english_name: org.englishName || '',
        country: countryName,
        organisation_category: cat,
      });
      toast.success(`Found ${org.legalName || pic}. Please review and save.`);
    } catch {
      toast.info('Lookup failed. Enter details manually.');
      setRegistryForm({ ...emptyRegistryForm, pic_number: pic });
    } finally {
      setLookingUp(false);
    }
  };

  const handleRegistrySave = async () => {
    if (!registryForm) return;
    if (!registryForm.name.trim()) return toast.error('Legal name is required');
    if (!registryForm.short_name.trim()) return toast.error('Short name is required');
    if (!registryForm.organisation_category) return toast.error('Category is required');

    setSavingRegistry(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from('organisations')
      .insert({
        pic_number: registryForm.pic_number,
        name: registryForm.name.trim(),
        short_name: registryForm.short_name.trim(),
        english_name: registryForm.english_name.trim() || null,
        country: registryForm.country || null,
        organisation_category: registryForm.organisation_category,
        created_by: user?.id,
      } as any)
      .select('id, name, short_name, english_name, pic_number, country, logo_url, organisation_category')
      .single();
    setSavingRegistry(false);
    if (error || !inserted) {
      toast.error(`Failed to add: ${error?.message || 'unknown error'}`);
      return;
    }
    toast.success('Organisation added to registry');
    // Refresh and auto-select
    await fetchOrgs();
    setSelectedOrg(inserted as RegistryOrg);
    closeRegistryDialog();
  };

  return (
    <>
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
                  <PopoverContent
                    className="w-[520px] p-0 z-50 bg-popover max-h-[60vh] overflow-hidden"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search by name, short name, English name or PIC…"
                        value={search}
                        onValueChange={setSearch}
                      />
                      <CommandList className="max-h-[50vh] overflow-y-auto overflow-x-hidden">
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
                    className="underline hover:text-foreground inline-flex items-center gap-0.5"
                    onClick={openRegistryDialog}
                  >
                    <Plus className="w-3 h-3" /> Add it to the registry
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

      {/* Inline Add-to-Registry dialog */}
      <Dialog open={registryOpen} onOpenChange={(o) => (o ? setRegistryOpen(o) : closeRegistryDialog())}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Add organisation to registry</DialogTitle>
            <DialogDescription>
              Enter a 9-digit PIC to pre-fill from the EU register, or fill in manually.
              The organisation will become available to all proposals on the platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="add-pic-input">PIC number</Label>
                <Input
                  id="add-pic-input"
                  value={picInput}
                  onChange={(e) => setPicInput(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLookup();
                    }
                  }}
                  placeholder="e.g. 906912365"
                  maxLength={9}
                  disabled={!!registryForm}
                />
              </div>
              <Button
                onClick={handleLookup}
                disabled={!/^\d{9}$/.test(picInput) || lookingUp || !!registryForm}
              >
                {lookingUp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Look up
              </Button>
            </div>

            {registryForm && (
              <div className="grid gap-4 pt-2 border-t">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>PIC</Label>
                    <Input value={registryForm.pic_number} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Short name *</Label>
                    <Input
                      value={registryForm.short_name}
                      onChange={(e) => setRegistryForm({ ...registryForm, short_name: e.target.value })}
                      placeholder="e.g. Sitra"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Legal name *</Label>
                  <Input
                    value={registryForm.name}
                    onChange={(e) => setRegistryForm({ ...registryForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>English name</Label>
                  <Input
                    value={registryForm.english_name}
                    onChange={(e) => setRegistryForm({ ...registryForm, english_name: e.target.value })}
                    placeholder="Leave blank if legal name is in English"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <CountrySelect
                      value={registryForm.country}
                      onValueChange={(v) => setRegistryForm({ ...registryForm, country: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select
                      value={registryForm.organisation_category}
                      onValueChange={(v) =>
                        setRegistryForm({ ...registryForm, organisation_category: v as OrganisationCategory })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ORGANISATION_CATEGORY_LABELS).map(([code, label]) => (
                          <SelectItem key={code} value={code}>
                            {code} – {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: a logo can be uploaded later from the Organisation Registry admin page.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeRegistryDialog} disabled={savingRegistry}>
              Cancel
            </Button>
            <Button onClick={handleRegistrySave} disabled={!registryForm || savingRegistry}>
              {savingRegistry && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add to registry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
