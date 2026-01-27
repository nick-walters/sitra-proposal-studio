import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { User } from 'lucide-react';

interface Person {
  id: string;
  full_name: string;
  email: string | null;
  default_role: string | null;
}

interface PersonAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPersonSelect: (person: Person | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PersonAutocomplete({
  value,
  onChange,
  onPersonSelect,
  placeholder = "Start typing a name...",
  disabled = false,
}: PersonAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Search for people when value changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value || value.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Search in the centralized people table
        const { data: people, error } = await supabase
          .from('people')
          .select('id, full_name, email, default_role')
          .ilike('full_name', `%${value}%`)
          .order('full_name')
          .limit(10);

        if (error) {
          console.error('Error searching people:', error);
          setSuggestions([]);
        } else {
          setSuggestions(people || []);
          setOpen((people || []).length > 0);
        }
      } catch (err) {
        console.error('Error in person search:', err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  const handleSelect = (person: Person) => {
    onChange(person.full_name);
    onPersonSelect(person);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    // Clear the selected person when user types (they're entering a new name)
    onPersonSelect(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="p-0 w-[var(--radix-popover-trigger-width)]" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              No matching people found. Keep typing to add a new person.
            </CommandEmpty>
            <CommandGroup heading="Suggestions">
              {suggestions.map((person) => (
                <CommandItem
                  key={person.id}
                  onSelect={() => handleSelect(person)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{person.full_name}</p>
                      {person.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {person.email}
                          {person.default_role && ` • ${person.default_role}`}
                        </p>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
