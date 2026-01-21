import { useState, useMemo, useEffect } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Proposal {
  id: string;
  acronym: string;
  title: string;
}

// Demo proposals for testing when no database proposals available
const DEMO_PROPOSALS: Proposal[] = [
  { id: 'demo-1', acronym: 'AURORA', title: 'Advanced Urban Renewable Optimisation and Resource Allocation' },
  { id: 'demo-2', acronym: 'BEACON', title: 'Breakthrough Energy and Carbon Optimisation Networks' },
  { id: 'demo-3', acronym: 'CATALYST', title: 'Carbon-neutral Advanced Technologies And Logistics for Sustainable Transport' },
  { id: 'demo-4', acronym: 'DELTA', title: 'Digital European Learning and Training Alliance' },
  { id: 'demo-5', acronym: 'EVOLVE', title: 'European Value-chain Optimisation for Low-carbon Ventures and Ecosystems' },
  { id: 'demo-6', acronym: 'FUSION', title: 'Future Systems for Integrated Optimisation Networks' },
  { id: 'demo-7', acronym: 'GENESIS', title: 'Green Energy Networks for European Sustainable Infrastructure Systems' },
  { id: 'demo-8', acronym: 'HORIZON', title: 'Holistic Optimisation of Resources for Integrated Zero-emission Networks' },
  { id: 'demo-9', acronym: 'IMPACT', title: 'Innovative Methods for Policy Analysis and Climate Transition' },
  { id: 'demo-10', acronym: 'NEXUS', title: 'Network for Excellence in Unified Sustainability' },
];

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
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProposals() {
      setLoading(true);
      const { data, error } = await supabase
        .from("proposals")
        .select("id, acronym, title")
        .order("acronym", { ascending: true });

      if (!error && data && data.length > 0) {
        setProposals(data);
      } else {
        // Use demo proposals for testing when no database proposals available
        setProposals(DEMO_PROPOSALS);
      }
      setLoading(false);
    }
    fetchProposals();
  }, []);

  const sortedProposals = useMemo(() => {
    return [...proposals].sort((a, b) => 
      a.acronym.localeCompare(b.acronym, undefined, { sensitivity: 'base' })
    );
  }, [proposals]);

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
      <Popover open={open} onOpenChange={setOpen}>
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
          <Command>
            <CommandInput placeholder="Type acronym to search..." />
            <CommandList>
              <CommandEmpty>
                {loading ? "Loading proposals..." : "No proposals found."}
              </CommandEmpty>
              <CommandGroup>
                {sortedProposals.map((proposal) => {
                  const isSelected = selectedProposalIds.includes(proposal.id);
                  return (
                    <CommandItem
                      key={proposal.id}
                      value={proposal.acronym}
                      onSelect={() => toggleProposal(proposal.id)}
                      className="cursor-pointer"
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
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
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
