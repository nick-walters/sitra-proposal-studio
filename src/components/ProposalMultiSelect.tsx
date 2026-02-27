import { useState, useMemo, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { SAMPLE_PROPOSALS_BASIC, type SampleProposalBasic } from "@/lib/sampleProposals";

type Proposal = SampleProposalBasic;

interface ProposalMultiSelectProps {
  selectedProposalIds: string[];
  onSelectionChange: (ids: string[]) => void;
  placeholder?: string;
}

export function ProposalMultiSelect({
  selectedProposalIds,
  onSelectionChange,
  placeholder = "Select proposals...",
}: ProposalMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>(SAMPLE_PROPOSALS_BASIC);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchProposals() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("proposals")
          .select("id, acronym, title")
          .order("acronym", { ascending: true });

        if (!error && data && data.length > 0) {
          setProposals(data);
        } else {
          // Fallback to sample proposals
          setProposals(SAMPLE_PROPOSALS_BASIC);
        }
      } catch (err) {
        console.error('Error fetching proposals:', err);
        setProposals(SAMPLE_PROPOSALS_BASIC);
      } finally {
        setLoading(false);
      }
    }
    fetchProposals();
  }, []);

  const filteredProposals = useMemo(() => {
    const sorted = [...proposals].sort((a, b) => 
      a.acronym.localeCompare(b.acronym, undefined, { sensitivity: 'base' })
    );
    if (!search) return sorted;
    const searchLower = search.toLowerCase();
    return sorted.filter(p => 
      p.acronym.toLowerCase().includes(searchLower) ||
      p.title.toLowerCase().includes(searchLower)
    );
  }, [proposals, search]);

  const selectedProposals = useMemo(() => {
    return proposals.filter(p => selectedProposalIds.includes(p.id));
  }, [proposals, selectedProposalIds]);

  const toggleProposal = (proposalId: string) => {
    if (selectedProposalIds.includes(proposalId)) {
      onSelectionChange(selectedProposalIds.filter(id => id !== proposalId));
    } else {
      onSelectionChange([...selectedProposalIds, proposalId]);
    }
  };

  const removeProposal = (proposalId: string) => {
    onSelectionChange(selectedProposalIds.filter(id => id !== proposalId));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setSearch("");
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-10"
          >
            <span className="text-muted-foreground">
              {selectedProposalIds.length === 0
                ? placeholder
                : `${selectedProposalIds.length} proposal${selectedProposalIds.length > 1 ? 's' : ''} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 z-[100]" align="start">
          <div className="flex flex-col bg-popover rounded-md" style={{ maxHeight: '350px' }}>
            <div className="flex items-center border-b px-3 shrink-0">
              <Input
                placeholder="Type acronym to search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
              />
            </div>
            <div 
              style={{ 
                maxHeight: '300px', 
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain'
              }}
            >
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading proposals...
                </div>
              ) : filteredProposals.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No proposals found.
                </div>
              ) : (
                <div className="p-1">
                  {filteredProposals.map((proposal) => {
                    const isSelected = selectedProposalIds.includes(proposal.id);
                    return (
                      <div
                        key={proposal.id}
                        onClick={() => toggleProposal(proposal.id)}
                        className="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="font-medium">{proposal.acronym}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {proposal.title}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected proposals as badges */}
      {selectedProposals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedProposals.map((proposal) => (
            <Badge
              key={proposal.id}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {proposal.acronym}
              <button
                type="button"
                className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-muted-foreground/20 p-0.5"
                onClick={() => removeProposal(proposal.id)}
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Remove {proposal.acronym}</span>
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
