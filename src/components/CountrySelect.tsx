import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES, Country } from "@/lib/countries";

interface CountrySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  hasError?: boolean;
  placeholder?: string;
}

export function CountrySelect({ 
  value, 
  onValueChange, 
  className, 
  hasError,
  placeholder = "Select country" 
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);

  const allCountries = useMemo(() => [
    ...EU_MEMBER_STATES,
    ...ASSOCIATED_COUNTRIES,
    ...THIRD_COUNTRIES,
  ], []);

  const selectedCountry = useMemo(() => {
    return allCountries.find(c => c.name === value);
  }, [value, allCountries]);

  const renderCountryItem = (country: Country) => (
    <CommandItem
      key={country.code}
      value={country.name}
      onSelect={() => {
        onValueChange(country.name);
        setOpen(false);
      }}
      className="cursor-pointer"
    >
      <Check
        className={cn(
          "mr-2 h-4 w-4",
          value === country.name ? "opacity-100" : "opacity-0"
        )}
      />
      <span className="mr-2">{country.flag}</span>
      <span>{country.name}</span>
    </CommandItem>
  );

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
          {selectedCountry ? (
            <span className="flex items-center gap-2 truncate">
              <span>{selectedCountry.flag}</span>
              <span>{selectedCountry.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup heading="EU Member States">
              {EU_MEMBER_STATES.map(renderCountryItem)}
            </CommandGroup>
            <CommandGroup heading="Associated Countries">
              {ASSOCIATED_COUNTRIES.map(renderCountryItem)}
            </CommandGroup>
            <CommandGroup heading="Third Countries">
              {THIRD_COUNTRIES.map(renderCountryItem)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
