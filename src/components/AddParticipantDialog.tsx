import { useState } from 'react';
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
import { Loader2, Search, Building2, Info, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PARTICIPANT_TYPE_LABELS, ParticipantType } from '@/types/proposal';
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES } from '@/lib/countries';
import { ORGANISATION_CATEGORY_LABELS, OrganisationCategory } from '@/components/ParticipantTable';

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
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Manual entry form state
  const [manualForm, setManualForm] = useState({
    organisationName: '',
    organisationShortName: '',
    organisationType: 'beneficiary' as ParticipantType,
    country: '',
    organisationCategory: '' as OrganisationCategory | '',
  });

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

  const handleAddManual = async () => {
    if (!manualForm.organisationName.trim()) {
      toast.error('Organisation name is required');
      return;
    }

    setLoading(true);
    try {
      await onAddParticipant({
        organisationName: manualForm.organisationName.trim(),
        organisationShortName: manualForm.organisationShortName.trim() || undefined,
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
    setSearchError(null);
    setManualForm({
      organisationName: '',
      organisationShortName: '',
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
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 pt-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="org-name">Organisation Name *</Label>
                <Input
                  id="org-name"
                  value={manualForm.organisationName}
                  onChange={(e) => setManualForm({ ...manualForm, organisationName: e.target.value })}
                  placeholder="e.g. University of Helsinki"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="short-name">Short Name</Label>
                  <Input
                    id="short-name"
                    value={manualForm.organisationShortName}
                    onChange={(e) => setManualForm({ ...manualForm, organisationShortName: e.target.value })}
                    placeholder="e.g. UH"
                  />
                </div>
                <div>
                  <Label>Participant Type</Label>
                  <Select
                    value={manualForm.organisationType}
                    onValueChange={(v) => setManualForm({ ...manualForm, organisationType: v as ParticipantType })}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Country</Label>
                  <Select
                    value={manualForm.country}
                    onValueChange={(v) => setManualForm({ ...manualForm, country: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {[...EU_MEMBER_STATES, ...ASSOCIATED_COUNTRIES, ...THIRD_COUNTRIES].map((country) => (
                        <SelectItem key={country.code} value={country.name}>{country.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Organisation Category</Label>
                  <Select
                    value={manualForm.organisationCategory}
                    onValueChange={(v) => setManualForm({ ...manualForm, organisationCategory: v as OrganisationCategory })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ORGANISATION_CATEGORY_LABELS).map(([code, label]) => (
                        <SelectItem key={code} value={code}>{code} - {label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              disabled={loading || !manualForm.organisationName.trim()}
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
