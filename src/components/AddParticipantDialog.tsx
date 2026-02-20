import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Loader2, Building2, Info, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { PARTICIPANT_TYPE_LABELS, ParticipantType } from '@/types/proposal';
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES } from '@/lib/countries';
import { ORGANISATION_CATEGORY_LABELS, OrganisationCategory } from '@/types/proposal';
import { cn } from '@/lib/utils';

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
    isSme: boolean;
    organisationCategory?: OrganisationCategory;
    englishName?: string;
    logoUrl?: string;
  }) => Promise<void>;
  participantCount: number;
}

export function AddParticipantDialog({
  open,
  onOpenChange,
  onAddParticipant,
  participantCount,
}: AddParticipantDialogProps) {
  const [loading, setLoading] = useState(false);
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  
  // Form state
  const [form, setForm] = useState({
    organisationName: '',
    organisationShortName: '',
    englishName: '',
    picNumber: '',
    organisationType: 'beneficiary' as ParticipantType,
    country: '',
    organisationCategory: '' as OrganisationCategory | '',
    logoUrl: '',
  });
  
  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!form.organisationName.trim()) {
      errors.organisationName = 'Legal name is required';
    }
    
    if (!form.picNumber.trim()) {
      errors.picNumber = 'PIC is required';
    } else if (!/^\d{9}$/.test(form.picNumber.trim())) {
      errors.picNumber = 'PIC must be a 9-digit code';
    }
    
    if (!form.country) {
      errors.country = 'Country is required';
    }
    
    if (!form.organisationCategory) {
      errors.organisationCategory = 'Organisation category is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAdd = async () => {
    if (!validateForm()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await onAddParticipant({
        organisationName: form.organisationName.trim(),
        organisationShortName: form.organisationShortName.trim() || undefined,
        englishName: form.englishName.trim() || undefined,
        picNumber: form.picNumber.trim(),
        organisationType: form.organisationType,
        country: form.country || undefined,
        isSme: false,
        organisationCategory: form.organisationCategory || undefined,
        legalEntityType: form.organisationCategory || undefined,
        logoUrl: form.logoUrl || undefined,
      });
      handleClose();
      toast.success('Participant added successfully');
    } catch (error) {
      console.error('Add participant error:', error);
      toast.error('Failed to add participant');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormErrors({});
    setForm({
      organisationName: '',
      organisationShortName: '',
      englishName: '',
      picNumber: '',
      organisationType: 'beneficiary',
      country: '',
      organisationCategory: '',
      logoUrl: '',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Add participant #{participantCount + 1}
          </DialogTitle>
          <DialogDescription>
            Add a new participating organisation to your consortium.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              Enter organisation details. Fields marked with * are required.
            </AlertDescription>
          </Alert>
          
          <div className="grid gap-4">
            {/* PIC and Short Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pic-number">PIC *</Label>
                <Input
                  id="pic-number"
                  value={form.picNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                    setForm(prev => ({ ...prev, picNumber: value }));
                    if (formErrors.picNumber) setFormErrors(prev => ({ ...prev, picNumber: '' }));
                  }}
                  placeholder="e.g. 906912365"
                  maxLength={9}
                  className={formErrors.picNumber ? 'border-destructive' : ''}
                />
                {formErrors.picNumber && (
                  <p className="text-xs text-destructive mt-1">{formErrors.picNumber}</p>
                )}
              </div>
              <div>
                <Label htmlFor="short-name">Short name</Label>
                <Input
                  id="short-name"
                  value={form.organisationShortName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm(prev => ({ ...prev, organisationShortName: value }));
                  }}
                  placeholder="e.g. Sitra"
                />
              </div>
            </div>

            {/* Legal Name - Required - Name Case */}
            <div>
              <Label htmlFor="org-name">Legal name *</Label>
              <Input
                id="org-name"
                value={form.organisationName}
                onChange={(e) => {
                  // Apply name case
                  const value = e.target.value.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
                  setForm(prev => ({ ...prev, organisationName: value }));
                  if (formErrors.organisationName) setFormErrors(prev => ({ ...prev, organisationName: '' }));
                }}
                placeholder="e.g. Suomen Itsenäisyyden Juhlarahasto"
                className={formErrors.organisationName ? 'border-destructive' : ''}
              />
              {formErrors.organisationName && (
                <p className="text-xs text-destructive mt-1">{formErrors.organisationName}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                The official legal name as registered
              </p>
            </div>
            
            {/* English Name - Optional - Name Case */}
            <div>
              <Label htmlFor="english-name">English name (if different from legal name)</Label>
              <Input
                id="english-name"
                value={form.englishName}
                onChange={(e) => {
                  // Apply name case
                  const value = e.target.value.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
                  setForm(prev => ({ ...prev, englishName: value }));
                }}
                placeholder="e.g. The Finnish Innovation Fund"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank if the legal name is already in English
              </p>
            </div>
            
            {/* Country and Category - Required */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Country *</Label>
                <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={countryPopoverOpen}
                      className={cn(
                        "w-full justify-between font-normal",
                        !form.country && "text-muted-foreground",
                        formErrors.country && "border-destructive"
                      )}
                    >
                      {form.country || "Select country"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-0 z-50 bg-popover" align="start">
                    <Command>
                      <CommandInput placeholder="Search country..." />
                      <CommandList className="max-h-60 overflow-y-auto">
                        <CommandEmpty>No country found.</CommandEmpty>
                        <CommandGroup heading="EU Member States">
                          {EU_MEMBER_STATES.map((country) => (
                            <CommandItem
                              key={country.code}
                              value={country.name}
                              onSelect={() => {
                                setForm(prev => ({ ...prev, country: country.name }));
                                if (formErrors.country) setFormErrors(prev => ({ ...prev, country: '' }));
                                setCountryPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.country === country.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {country.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandGroup heading="Associated Countries">
                          {ASSOCIATED_COUNTRIES.map((country) => (
                            <CommandItem
                              key={country.code}
                              value={country.name}
                              onSelect={() => {
                                setForm(prev => ({ ...prev, country: country.name }));
                                if (formErrors.country) setFormErrors(prev => ({ ...prev, country: '' }));
                                setCountryPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.country === country.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {country.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandGroup heading="Third Countries">
                          {THIRD_COUNTRIES.map((country) => (
                            <CommandItem
                              key={country.code}
                              value={country.name}
                              onSelect={() => {
                                setForm(prev => ({ ...prev, country: country.name }));
                                if (formErrors.country) setFormErrors(prev => ({ ...prev, country: '' }));
                                setCountryPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.country === country.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {country.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {formErrors.country && (
                  <p className="text-xs text-destructive mt-1">{formErrors.country}</p>
                )}
              </div>
              <div>
                <Label>Organisation category *</Label>
                <Select
                  value={form.organisationCategory}
                  onValueChange={(v) => {
                    setForm(prev => ({ ...prev, organisationCategory: v as OrganisationCategory }));
                    if (formErrors.organisationCategory) setFormErrors(prev => ({ ...prev, organisationCategory: '' }));
                  }}
                >
                  <SelectTrigger className={formErrors.organisationCategory ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORGANISATION_CATEGORY_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>{code} - {label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.organisationCategory && (
                  <p className="text-xs text-destructive mt-1">{formErrors.organisationCategory}</p>
                )}
              </div>
            </div>

            {/* Participant Type */}
            <div>
              <Label>Participant type</Label>
              <Select
                value={form.organisationType}
                onValueChange={(v) => setForm(prev => ({ ...prev, organisationType: v as ParticipantType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PARTICIPANT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={loading}
            className="gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Add participant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
