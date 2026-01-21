import { useState, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface Organisation {
  id: string;
  name: string;
  short_name: string | null;
  country: string | null;
  logo_url: string | null;
}

interface OrganisationSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  hasError?: boolean;
  placeholder?: string;
}

export function OrganisationSelect({ 
  value, 
  onValueChange, 
  className, 
  hasError,
  placeholder = "Select or enter organisation" 
}: OrganisationSelectProps) {
  const [open, setOpen] = useState(false);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchOrganisations();
  }, []);

  const fetchOrganisations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("organisations")
        .select("id, name, short_name, country, logo_url")
        .order("name", { ascending: true });

      if (!error && data) {
        setOrganisations(data);
      }
    } catch (err) {
      console.error("Error fetching organisations:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrganisations = useMemo(() => {
    if (!searchValue.trim()) return organisations;
    const search = searchValue.toLowerCase();
    return organisations.filter(org => 
      org.name.toLowerCase().includes(search) ||
      (org.short_name && org.short_name.toLowerCase().includes(search))
    );
  }, [organisations, searchValue]);

  const showCreateOption = useMemo(() => {
    if (!searchValue.trim()) return false;
    const searchLower = searchValue.toLowerCase().trim();
    return !organisations.some(org => 
      org.name.toLowerCase() === searchLower
    );
  }, [searchValue, organisations]);

  const handleCreateOrganisation = async () => {
    if (!searchValue.trim()) return;
    
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("organisations")
        .insert({ name: searchValue.trim() })
        .select()
        .single();

      if (error) {
        // If duplicate, just use the existing one
        if (error.code === '23505') {
          onValueChange(searchValue.trim());
          setOpen(false);
          return;
        }
        throw error;
      }

      if (data) {
        setOrganisations(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        onValueChange(data.name);
        setOpen(false);
      }
    } catch (err) {
      console.error("Error creating organisation:", err);
      // Still set the value even if DB insert fails
      onValueChange(searchValue.trim());
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (orgName: string) => {
    onValueChange(orgName);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            hasError && "border-destructive",
            className
          )}
        >
          {value ? (
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{value}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Type to search or add..." 
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className="max-h-[300px]">
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading organisations...
              </div>
            ) : (
              <>
                {filteredOrganisations.length === 0 && !showCreateOption && (
                  <CommandEmpty>No organisations found. Start typing to add one.</CommandEmpty>
                )}
                
                {showCreateOption && (
                  <CommandGroup heading="Add new organisation">
                    <CommandItem
                      onSelect={handleCreateOrganisation}
                      className="cursor-pointer"
                      disabled={creating}
                    >
                      <Plus className="mr-2 h-4 w-4 text-primary" />
                      <span>Add "{searchValue.trim()}"</span>
                    </CommandItem>
                  </CommandGroup>
                )}

                {filteredOrganisations.length > 0 && (
                  <CommandGroup heading="Organisations">
                    {filteredOrganisations.map((org) => (
                      <CommandItem
                        key={org.id}
                        value={org.name}
                        onSelect={() => handleSelect(org.name)}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === org.name ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate">{org.name}</span>
                          {org.short_name && (
                            <span className="text-xs text-muted-foreground truncate">
                              {org.short_name}
                              {org.country && ` • ${org.country}`}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
