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
import { ALL_COUNTRIES_SORTED, EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES, Country } from "@/lib/countries";

interface CountryCodeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  hasError?: boolean;
}

export function CountryCodeSelect({ value, onValueChange, className, hasError }: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedCountry = useMemo(() => {
    return ALL_COUNTRIES_SORTED.find(c => c.dialCode === value);
  }, [value]);

  // Custom filter that matches country name or dial code (with or without +)
  const filterCountry = (searchValue: string, itemValue: string) => {
    const search = searchValue.toLowerCase().replace(/^\+/, '');
    const country = ALL_COUNTRIES_SORTED.find(c => 
      c.name.toLowerCase() === itemValue.toLowerCase()
    );
    
    if (!country) return 0;
    
    const nameMatch = country.name.toLowerCase().includes(search);
    const dialMatch = country.dialCode.replace('+', '').includes(search);
    
    return nameMatch || dialMatch ? 1 : 0;
  };

  const renderCountryItem = (country: Country) => (
    <CommandItem
      key={country.code}
      value={country.name}
      onSelect={() => {
        onValueChange(country.dialCode);
        setOpen(false);
      }}
      className="cursor-pointer"
    >
      <Check
        className={cn(
          "mr-2 h-4 w-4",
          value === country.dialCode ? "opacity-100" : "opacity-0"
        )}
      />
      <span className="mr-2">{country.flag}</span>
      <span className="flex-1">{country.name}</span>
      <span className="text-muted-foreground">{country.dialCode}</span>
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
            "w-[130px] justify-between px-3",
            hasError && "border-destructive",
            className
          )}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-1.5 truncate">
              <span>{selectedCountry.flag}</span>
              <span>{selectedCountry.dialCode}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Code</span>
          )}
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command filter={filterCountry}>
          <CommandInput placeholder="Search country or code..." />
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
