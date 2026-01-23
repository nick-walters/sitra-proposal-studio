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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Loader2, Search, Building2, Info, CheckCircle2, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PARTICIPANT_TYPE_LABELS, ParticipantType } from '@/types/proposal';
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES } from '@/lib/countries';
import { ORGANISATION_CATEGORY_LABELS, OrganisationCategory } from '@/components/ParticipantTable';
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
  }) => Promise<void>;
  participantCount: number;
}

interface SearchResult {
  picNumber: string;
  legalName: string;
  shortName?: string;
  country: string;
  countryCode: string;
  legalEntityType?: string;
  isSme: boolean;
  organisationCategory?: OrganisationCategory;
}

export function AddParticipantDialog({
  open,
  onOpenChange,
  onAddParticipant,
  participantCount,
}: AddParticipantDialogProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'manual'>('search');
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [searchEnglishName, setSearchEnglishName] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  
  // All countries combined for searching
  const allCountries = useMemo(() => [
    ...EU_MEMBER_STATES.map(c => ({ ...c, group: 'EU Member States' })),
    ...ASSOCIATED_COUNTRIES.map(c => ({ ...c, group: 'Associated Countries' })),
    ...THIRD_COUNTRIES.map(c => ({ ...c, group: 'Third Countries' })),
  ], []);
  
  // Manual entry form state
  const [manualForm, setManualForm] = useState({
    organisationName: '',
    organisationShortName: '',
    englishName: '',
    picNumber: '',
    organisationType: 'beneficiary' as ParticipantType,
    country: '',
    organisationCategory: '' as OrganisationCategory | '',
  });
  
  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) {
      toast.error('Please enter at least 2 characters to search');
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    setSelectedResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('lookup-pic', {
        body: { searchTerm: searchQuery.trim() },
      });

      if (error) {
        console.error('Search error:', error);
        setSearchError('Failed to connect to the search service. Please try again or enter details manually.');
        return;
      }

      if (data.success && data.results) {
        setSearchResults(data.results);
        if (data.results.length === 0) {
          setSearchError('No organisations found. Try different search terms, or enter details manually.');
        } else if (data.results.length === 1) {
          // Auto-select if only one result
          setSelectedResult(data.results[0]);
        }
      } else {
        setSearchError(data.message || 'Search failed. Please try again.');
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchError('Search failed. Please try again or enter details manually.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectResult = (org: SearchResult) => {
    setSelectedResult(org);
  };

  const handleAddFromSearch = async () => {
    if (!selectedResult) return;

    // Validate required fields from search result
    const missingFields: string[] = [];
    if (!selectedResult.picNumber?.trim()) missingFields.push('PIC number');
    if (!selectedResult.legalName?.trim()) missingFields.push('Organisation name');
    if (!selectedResult.country?.trim()) missingFields.push('Country');
    
    if (missingFields.length > 0) {
      toast.error(`Missing required fields: ${missingFields.join(', ')}. Please use manual entry to complete the details.`);
      setActiveTab('manual');
      // Pre-fill manual form with available data
      setManualForm({
        organisationName: selectedResult.legalName || '',
        organisationShortName: selectedResult.shortName || '',
        englishName: searchEnglishName,
        picNumber: selectedResult.picNumber || '',
        organisationType: 'beneficiary',
        country: selectedResult.country || '',
        organisationCategory: selectedResult.organisationCategory || '',
      });
      return;
    }

    setLoading(true);
    try {
      await onAddParticipant({
        organisationName: selectedResult.legalName,
        organisationShortName: selectedResult.shortName,
        organisationType: 'beneficiary',
        country: selectedResult.country,
        picNumber: selectedResult.picNumber,
        legalEntityType: selectedResult.legalEntityType,
        isSme: selectedResult.isSme,
        organisationCategory: selectedResult.organisationCategory,
        englishName: searchEnglishName.trim() || undefined,
      });
      handleClose();
      toast.success('Participant added successfully');
    } catch (error) {
      console.error('Add participant error:', error);
      // Don't show duplicate toast - the hook already shows it
    } finally {
      setLoading(false);
    }
  };

  const validateManualForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!manualForm.organisationName.trim()) {
      errors.organisationName = 'Legal name is required';
    }
    
    if (!manualForm.picNumber.trim()) {
      errors.picNumber = 'PIC number is required';
    } else if (!/^\d{9}$/.test(manualForm.picNumber.trim())) {
      errors.picNumber = 'PIC must be a 9-digit number';
    }
    
    if (!manualForm.country) {
      errors.country = 'Country is required';
    }
    
    if (!manualForm.organisationCategory) {
      errors.organisationCategory = 'Organisation category is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddManual = async () => {
    if (!validateManualForm()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await onAddParticipant({
        organisationName: manualForm.organisationName.trim(),
        organisationShortName: manualForm.organisationShortName.trim() || undefined,
        englishName: manualForm.englishName.trim() || undefined,
        picNumber: manualForm.picNumber.trim(),
        organisationType: manualForm.organisationType,
        country: manualForm.country || undefined,
        isSme: false,
        organisationCategory: manualForm.organisationCategory || undefined,
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
    setSearchQuery('');
    setSearchResults([]);
    setSelectedResult(null);
    setSearchEnglishName('');
    setSearchError(null);
    setFormErrors({});
    setManualForm({
      organisationName: '',
      organisationShortName: '',
      englishName: '',
      picNumber: '',
      organisationType: 'beneficiary',
      country: '',
      organisationCategory: '',
    });
    setActiveTab('search');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Add Participant #{participantCount + 1}
          </DialogTitle>
          <DialogDescription>
            Add a new participating organisation to your consortium.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'search' | 'manual')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4 pt-4">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                Search by PIC number (e.g. 906912365) or organisation name (e.g. Sitra, University of Helsinki).
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="search-query" className="sr-only">Search</Label>
                <Input
                  id="search-query"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchResults([]);
                    setSelectedResult(null);
                    setSearchError(null);
                  }}
                  placeholder="Enter PIC number or organisation name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                />
              </div>
              <Button 
                onClick={handleSearch} 
                disabled={searchLoading || searchQuery.length < 2}
                className="gap-2"
              >
                {searchLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Search
              </Button>
            </div>

            {searchError && (
              <Alert variant="destructive">
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Found {searchResults.length} organisation{searchResults.length !== 1 ? 's' : ''} - click to select
                </Label>
                <div className="max-h-52 overflow-y-auto space-y-2">
                  {searchResults.map((org, idx) => (
                    <button
                      key={`${org.picNumber || org.legalName}-${idx}`}
                      onClick={() => handleSelectResult(org)}
                      className={`w-full p-3 rounded-lg border transition-colors text-left ${
                        selectedResult?.legalName === org.legalName && selectedResult?.picNumber === org.picNumber
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{org.legalName}</p>
                            {selectedResult?.legalName === org.legalName && selectedResult?.picNumber === org.picNumber && (
                              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                            )}
                          </div>
                          {org.shortName && (
                            <p className="text-sm text-muted-foreground">({org.shortName})</p>
                          )}
                        </div>
                        <div className="text-right text-sm shrink-0">
                          <p className="text-muted-foreground">{org.country}</p>
                          {org.picNumber && (
                            <p className="font-mono text-xs text-muted-foreground">{org.picNumber}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedResult && (
              <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{selectedResult.legalName}</h4>
                    {selectedResult.shortName && (
                      <p className="text-sm text-muted-foreground">Short name: {selectedResult.shortName}</p>
                    )}
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Country:</span>{' '}
                    <span className="font-medium">{selectedResult.country}</span>
                  </div>
                  {selectedResult.picNumber && (
                    <div>
                      <span className="text-muted-foreground">PIC:</span>{' '}
                      <span className="font-medium font-mono">{selectedResult.picNumber}</span>
                    </div>
                  )}
                  {selectedResult.legalEntityType && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Type:</span>{' '}
                      <span className="font-medium">{selectedResult.legalEntityType}</span>
                    </div>
                  )}
                  {selectedResult.organisationCategory && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Category:</span>{' '}
                      <span className="font-medium">
                        {selectedResult.organisationCategory} - {ORGANISATION_CATEGORY_LABELS[selectedResult.organisationCategory]}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* English name input - optional */}
                <div className="pt-2 border-t">
                  <Label htmlFor="search-english-name" className="text-sm">
                    English Name (if different from legal name)
                  </Label>
                  <Input
                    id="search-english-name"
                    value={searchEnglishName}
                    onChange={(e) => setSearchEnglishName(e.target.value)}
                    placeholder="e.g. The Finnish Innovation Fund"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank if the legal name is already in English
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 pt-4">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                Enter organisation details manually. Fields marked with * are required.
              </AlertDescription>
            </Alert>
            
            <div className="grid gap-4">
              {/* PIC Number - Required */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pic-number">PIC Number *</Label>
                  <Input
                    id="pic-number"
                    value={manualForm.picNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                      setManualForm(prev => ({ ...prev, picNumber: value }));
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
                  <Label htmlFor="short-name">Short Name</Label>
                  <Input
                    id="short-name"
                    value={manualForm.organisationShortName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setManualForm(prev => ({ ...prev, organisationShortName: value }));
                    }}
                    placeholder="e.g. Sitra"
                  />
                </div>
              </div>

              {/* Legal Name - Required */}
              <div>
                <Label htmlFor="org-name">Legal Name *</Label>
                <Input
                  id="org-name"
                  value={manualForm.organisationName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setManualForm(prev => ({ ...prev, organisationName: value }));
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
              
              {/* English Name - Optional */}
              <div>
                <Label htmlFor="english-name">English Name (if different from legal name)</Label>
              <Input
                  id="english-name"
                  value={manualForm.englishName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setManualForm(prev => ({ ...prev, englishName: value }));
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
                          !manualForm.country && "text-muted-foreground",
                          formErrors.country && "border-destructive"
                        )}
                      >
                        {manualForm.country || "Select country"}
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
                                  setManualForm(prev => ({ ...prev, country: country.name }));
                                  if (formErrors.country) setFormErrors(prev => ({ ...prev, country: '' }));
                                  setCountryPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    manualForm.country === country.name ? "opacity-100" : "opacity-0"
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
                                  setManualForm(prev => ({ ...prev, country: country.name }));
                                  if (formErrors.country) setFormErrors(prev => ({ ...prev, country: '' }));
                                  setCountryPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    manualForm.country === country.name ? "opacity-100" : "opacity-0"
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
                                  setManualForm(prev => ({ ...prev, country: country.name }));
                                  if (formErrors.country) setFormErrors(prev => ({ ...prev, country: '' }));
                                  setCountryPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    manualForm.country === country.name ? "opacity-100" : "opacity-0"
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
                  <Label>Organisation Category *</Label>
                  <Select
                    value={manualForm.organisationCategory}
                    onValueChange={(v) => {
                      setManualForm(prev => ({ ...prev, organisationCategory: v as OrganisationCategory }));
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
                <Label>Participant Type</Label>
                <Select
                  value={manualForm.organisationType}
                  onValueChange={(v) => setManualForm(prev => ({ ...prev, organisationType: v as ParticipantType }))}
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
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {activeTab === 'search' ? (
            <Button 
              onClick={handleAddFromSearch} 
              disabled={loading || !selectedResult}
              className="gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Participant
            </Button>
          ) : (
            <Button 
              onClick={handleAddManual} 
              disabled={loading}
              className="gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Participant
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
