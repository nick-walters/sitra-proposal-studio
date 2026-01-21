import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EU_MEMBER_STATES, ASSOCIATED_COUNTRIES, THIRD_COUNTRIES, Country } from "@/lib/countries";

interface CountryCodeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  hasError?: boolean;
}

export function CountryCodeSelect({ value, onValueChange, className, hasError }: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const allCountries = useMemo(() => [
    ...EU_MEMBER_STATES,
    ...ASSOCIATED_COUNTRIES,
    ...THIRD_COUNTRIES,
  ], []);

  const selectedCountry = useMemo(() => {
    return allCountries.find(c => c.dialCode === value);
  }, [value, allCountries]);

  // Filter countries by name or dial code (with or without +)
  const filterCountries = (countries: Country[]) => {
    if (!search) return countries;
    const searchLower = search.toLowerCase().replace(/^\+/, '');
    return countries.filter(c => 
      c.name.toLowerCase().includes(searchLower) ||
      c.dialCode.replace('+', '').includes(searchLower)
    );
  };

  const filteredEU = filterCountries(EU_MEMBER_STATES);
  const filteredAssociated = filterCountries(ASSOCIATED_COUNTRIES);
  const filteredThird = filterCountries(THIRD_COUNTRIES);
  const hasResults = filteredEU.length > 0 || filteredAssociated.length > 0 || filteredThird.length > 0;

  const handleSelect = (country: Country) => {
    onValueChange(country.dialCode);
    setOpen(false);
    setSearch("");
  };

  const renderCountryItem = (country: Country) => (
    <div
      key={country.code}
      onClick={() => handleSelect(country)}
      className="flex items-center px-2 py-1.5 text-sm cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
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
    </div>
  );

  const renderGroup = (heading: string, countries: Country[]) => {
    if (countries.length === 0) return null;
    return (
      <div className="p-1">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{heading}</div>
        {countries.map(renderCountryItem)}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setSearch("");
    }}>
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
      <PopoverContent className="w-[280px] p-0 z-50" align="start">
        <div className="flex flex-col bg-popover rounded-md" style={{ maxHeight: '350px' }}>
          <div className="flex items-center border-b px-3 shrink-0">
            <Input
              placeholder="Search country or code..."
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
            {hasResults ? (
              <>
                {renderGroup("EU Member States", filteredEU)}
                {renderGroup("Associated Countries", filteredAssociated)}
                {renderGroup("Third Countries", filteredThird)}
              </>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No country found.
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
