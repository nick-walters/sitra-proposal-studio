import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Hash,
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Building2,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface BulkPicLookupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  existingPics: Set<string>;
  onAddParticipant?: (participant: {
    organisationName: string;
    organisationShortName?: string;
    organisationType: 'beneficiary';
    country?: string;
    picNumber?: string;
    legalEntityType?: string;
    isSme: boolean;
    organisationCategory?: string;
    englishName?: string;
  }) => Promise<void>;
}

interface LookupResult {
  picNumber: string;
  status: 'found' | 'not_found' | 'exists' | 'error' | 'added';
  organisation?: {
    legalName: string;
    shortName?: string;
    country: string;
    organisationCategory?: string;
    legalEntityType?: string;
    isSme: boolean;
    englishName?: string;
  };
  error?: string;
}

export function BulkPicLookupDialog({
  isOpen,
  onClose,
  proposalId,
  existingPics,
  onAddParticipant,
}: BulkPicLookupDialogProps) {
  const [picInput, setPicInput] = useState('');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingPic, setAddingPic] = useState<string | null>(null);

  const handleLookup = useCallback(async () => {
    // Parse PIC numbers from input (comma, newline, or space separated)
    const pics = picInput
      .split(/[\s,;]+/)
      .map(s => s.replace(/\D/g, '').trim())
      .filter(s => s.length === 9);

    if (pics.length === 0) {
      toast.error('Enter at least one valid 9-digit PIC number');
      return;
    }

    const unique = [...new Set(pics)];
    setLoading(true);
    setResults([]);

    const lookupResults: LookupResult[] = [];

    for (const pic of unique) {
      if (existingPics.has(pic)) {
        lookupResults.push({ picNumber: pic, status: 'exists' });
        continue;
      }

      try {
        const { data, error } = await supabase.functions.invoke('lookup-pic', {
          body: { picNumber: pic },
        });

        if (error) {
          lookupResults.push({ picNumber: pic, status: 'error', error: 'Lookup failed' });
          continue;
        }

        if (data?.success && data?.organisation) {
          const org = data.organisation;
          lookupResults.push({
            picNumber: pic,
            status: 'found',
            organisation: {
              legalName: org.legalName,
              shortName: org.shortName,
              country: org.country,
              organisationCategory: org.organisationCategory,
              legalEntityType: org.legalEntityType,
              isSme: org.isSme || false,
              englishName: org.englishName,
            },
          });
        } else {
          lookupResults.push({ picNumber: pic, status: 'not_found' });
        }
      } catch {
        lookupResults.push({ picNumber: pic, status: 'error', error: 'Network error' });
      }
    }

    setResults(lookupResults);
    setLoading(false);

    const found = lookupResults.filter(r => r.status === 'found').length;
    const existing = lookupResults.filter(r => r.status === 'exists').length;
    const notFound = lookupResults.filter(r => r.status === 'not_found').length;
    toast.info(`${found} found, ${existing} already in consortium, ${notFound} not found`);
  }, [picInput, existingPics]);

  const handleAdd = useCallback(async (result: LookupResult) => {
    if (!onAddParticipant || !result.organisation) return;
    setAddingPic(result.picNumber);
    try {
      await onAddParticipant({
        organisationName: result.organisation.legalName,
        organisationShortName: result.organisation.shortName,
        organisationType: 'beneficiary',
        country: result.organisation.country,
        picNumber: result.picNumber,
        legalEntityType: result.organisation.legalEntityType,
        isSme: result.organisation.isSme,
        organisationCategory: result.organisation.organisationCategory,
        englishName: result.organisation.englishName,
      });
      setResults(prev =>
        prev.map(r => r.picNumber === result.picNumber ? { ...r, status: 'added' as const } : r)
      );
      toast.success(`Added ${result.organisation.shortName || result.organisation.legalName}`);
    } catch {
      toast.error('Failed to add participant');
    } finally {
      setAddingPic(null);
    }
  }, [onAddParticipant]);

  const handleAddAll = useCallback(async () => {
    const toAdd = results.filter(r => r.status === 'found' && r.organisation);
    for (const result of toAdd) {
      await handleAdd(result);
    }
  }, [results, handleAdd]);

  const foundCount = results.filter(r => r.status === 'found').length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-primary" />
            Bulk PIC Lookup
          </DialogTitle>
          <DialogDescription>
            Paste one or more 9-digit PIC numbers to auto-fill participant details from EU registries
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            placeholder="Enter PIC numbers separated by commas, spaces, or newlines&#10;e.g. 999990946, 999984059, 906912365"
            value={picInput}
            onChange={e => setPicInput(e.target.value)}
            className="min-h-[80px] font-mono text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={handleLookup} disabled={loading || !picInput.trim()} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Looking up...' : 'Look up PICs'}
            </Button>
            {foundCount > 0 && onAddParticipant && (
              <Button variant="outline" onClick={handleAddAll} className="gap-2">
                <Plus className="w-4 h-4" />
                Add all found ({foundCount})
              </Button>
            )}
          </div>
        </div>

        {results.length > 0 && (
          <ScrollArea className="flex-1 max-h-[400px] mt-2">
            <div className="space-y-2 pr-4">
              {results.map(result => (
                <div
                  key={result.picNumber}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    result.status === 'found' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                    : result.status === 'added' ? 'bg-primary/5 border-primary/20'
                    : result.status === 'exists' ? 'bg-muted border-border'
                    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  <div className="shrink-0">
                    {result.status === 'found' ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                      : result.status === 'added' ? <CheckCircle2 className="w-5 h-5 text-primary" />
                      : result.status === 'exists' ? <Building2 className="w-5 h-5 text-muted-foreground" />
                      : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{result.picNumber}</span>
                      {result.status === 'exists' && (
                        <Badge variant="secondary" className="text-[10px]">Already in consortium</Badge>
                      )}
                      {result.status === 'not_found' && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Not found</Badge>
                      )}
                      {result.status === 'added' && (
                        <Badge className="text-[10px]">Added</Badge>
                      )}
                    </div>
                    {result.organisation && (
                      <div className="text-sm mt-0.5">
                        <span className="font-medium">{result.organisation.shortName || result.organisation.legalName}</span>
                        {result.organisation.shortName && (
                          <span className="text-muted-foreground"> — {result.organisation.legalName}</span>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {result.organisation.country && (
                            <span className="text-xs text-muted-foreground">{result.organisation.country}</span>
                          )}
                          {result.organisation.organisationCategory && (
                            <Badge variant="outline" className="text-[10px]">{result.organisation.organisationCategory}</Badge>
                          )}
                          {result.organisation.isSme && (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">SME</Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {result.status === 'found' && onAddParticipant && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1"
                      disabled={addingPic === result.picNumber}
                      onClick={() => handleAdd(result)}
                    >
                      {addingPic === result.picNumber ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      Add
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
