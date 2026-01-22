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
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, Building2, Info } from 'lucide-react';
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

export function AddParticipantDialog({
  open,
  onOpenChange,
  onAddParticipant,
  participantCount,
}: AddParticipantDialogProps) {
  const [activeTab, setActiveTab] = useState<'pic' | 'manual'>('pic');
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [picNumber, setPicNumber] = useState('');
  const [lookupResult, setLookupResult] = useState<{
    legalName: string;
    shortName?: string;
    country: string;
    countryCode: string;
    city?: string;
    legalEntityType?: string;
    isSme: boolean;
    organisationCategory?: OrganisationCategory;
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  
  // Manual entry form state
  const [manualForm, setManualForm] = useState({
    organisationName: '',
    organisationShortName: '',
    organisationType: 'beneficiary' as ParticipantType,
    country: '',
    isSme: false,
    organisationCategory: '' as OrganisationCategory | '',
  });

  const handlePicLookup = async () => {
    if (!picNumber || picNumber.length < 5) {
      toast.error('Please enter a valid PIC number (minimum 5 digits)');
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('lookup-pic', {
        body: { picNumber: picNumber.trim() },
      });

      if (error) {
        console.error('Lookup error:', error);
        setLookupError('Failed to connect to the lookup service. Please try again or enter details manually.');
        return;
      }

      if (data.success && data.organisation) {
        setLookupResult(data.organisation);
        toast.success(`Found: ${data.organisation.legalName}`);
      } else {
        setLookupError(data.message || 'Organisation not found. Try entering details manually.');
      }
    } catch (error) {
      console.error('Lookup error:', error);
      setLookupError('Lookup failed. Please try again or enter details manually.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleAddFromLookup = async () => {
    if (!lookupResult) return;

    setLoading(true);
    try {
      await onAddParticipant({
        organisationName: lookupResult.legalName,
        organisationShortName: lookupResult.shortName,
        organisationType: 'beneficiary',
        country: lookupResult.country,
        picNumber: picNumber.trim(),
        legalEntityType: lookupResult.legalEntityType,
        isSme: lookupResult.isSme,
        organisationCategory: lookupResult.organisationCategory,
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
        isSme: manualForm.isSme,
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
    setPicNumber('');
    setLookupResult(null);
    setLookupError(null);
    setManualForm({
      organisationName: '',
      organisationShortName: '',
      organisationType: 'beneficiary',
      country: '',
      isSme: false,
      organisationCategory: '',
    });
    setActiveTab('pic');
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pic' | 'manual')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pic">PIC Lookup</TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="pic" className="space-y-4 pt-4">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                Enter the 9-digit PIC (Participant Identification Code) from the{' '}
                <a 
                  href="https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/participant-register" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline text-primary hover:no-underline"
                >
                  EC Participant Register
                </a>
                .
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="pic-number">PIC Number</Label>
                <Input
                  id="pic-number"
                  value={picNumber}
                  onChange={(e) => {
                    setPicNumber(e.target.value.replace(/\D/g, ''));
                    setLookupResult(null);
                    setLookupError(null);
                  }}
                  placeholder="e.g. 999994438"
                  maxLength={9}
                  className="font-mono"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handlePicLookup} 
                  disabled={lookupLoading || !picNumber}
                  className="gap-2"
                >
                  {lookupLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Lookup
                </Button>
              </div>
            </div>

            {lookupError && (
              <Alert variant="destructive">
                <AlertDescription>{lookupError}</AlertDescription>
              </Alert>
            )}

            {lookupResult && (
              <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{lookupResult.legalName}</h4>
                    {lookupResult.shortName && (
                      <p className="text-sm text-muted-foreground">Short name: {lookupResult.shortName}</p>
                    )}
                  </div>
                  {lookupResult.isSme && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      SME
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Country:</span>{' '}
                    <span className="font-medium">{lookupResult.country}</span>
                  </div>
                  {lookupResult.city && (
                    <div>
                      <span className="text-muted-foreground">City:</span>{' '}
                      <span className="font-medium">{lookupResult.city}</span>
                    </div>
                  )}
                  {lookupResult.legalEntityType && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Type:</span>{' '}
                      <span className="font-medium">{lookupResult.legalEntityType}</span>
                    </div>
                  )}
                  {lookupResult.organisationCategory && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Category:</span>{' '}
                      <span className="font-medium">
                        {lookupResult.organisationCategory} - {ORGANISATION_CATEGORY_LABELS[lookupResult.organisationCategory]}
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
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">EU Member States</div>
                      {EU_MEMBER_STATES.map((c) => (
                        <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>
                      ))}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Associated Countries</div>
                      {ASSOCIATED_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>
                      ))}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Third Countries</div>
                      {THIRD_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>
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

              <div className="flex items-center gap-2">
                <Checkbox
                  id="is-sme"
                  checked={manualForm.isSme}
                  onCheckedChange={(checked) => setManualForm({ ...manualForm, isSme: checked === true })}
                />
                <Label htmlFor="is-sme" className="cursor-pointer">
                  This is an SME (Small or Medium-sized Enterprise)
                </Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          {activeTab === 'pic' ? (
            <Button 
              onClick={handleAddFromLookup} 
              disabled={loading || !lookupResult}
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
