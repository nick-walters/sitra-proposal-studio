import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Globe, Building2, Sparkles, RefreshCw } from 'lucide-react';
import { Participant, PARTICIPANT_TYPE_LABELS, ParticipantType } from '@/types/proposal';

interface ConsortiumMapProps {
  participants?: Participant[];
  onGenerate?: () => void;
}

// Demo participants with coordinates
const DEMO_PARTICIPANTS: (Participant & { coordinates?: { lat: number; lng: number } })[] = [
  {
    id: 'demo-1',
    proposalId: 'demo',
    organisationName: 'Technical University of Munich',
    organisationShortName: 'TUM',
    country: 'Germany',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Logo_of_the_Technical_University_of_Munich.svg/200px-Logo_of_the_Technical_University_of_Munich.svg.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 1,
    coordinates: { lat: 48.15, lng: 11.57 },
  },
  {
    id: 'demo-2',
    proposalId: 'demo',
    organisationName: 'CEA',
    organisationShortName: 'CEA',
    country: 'France',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/CEA_logotype2012.png/200px-CEA_logotype2012.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 2,
    coordinates: { lat: 48.71, lng: 2.15 },
  },
  {
    id: 'demo-3',
    proposalId: 'demo',
    organisationName: 'Politecnico di Milano',
    organisationShortName: 'POLIMI',
    country: 'Italy',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Logo_Politecnico_Milano.png/200px-Logo_Politecnico_Milano.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 3,
    coordinates: { lat: 45.48, lng: 9.23 },
  },
  {
    id: 'demo-4',
    proposalId: 'demo',
    organisationName: 'KTH Royal Institute of Technology',
    organisationShortName: 'KTH',
    country: 'Sweden',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/KTH_Royal_Institute_of_Technology_logo.svg/200px-KTH_Royal_Institute_of_Technology_logo.svg.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 4,
    coordinates: { lat: 59.35, lng: 18.07 },
  },
  {
    id: 'demo-5',
    proposalId: 'demo',
    organisationName: 'National Technical University of Athens',
    organisationShortName: 'NTUA',
    country: 'Greece',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/NTUA_logo.svg/150px-NTUA_logo.svg.png',
    organisationType: 'associated_partner',
    isSme: false,
    participantNumber: 5,
    coordinates: { lat: 37.98, lng: 23.78 },
  },
  {
    id: 'demo-6',
    proposalId: 'demo',
    organisationName: 'Siemens AG',
    organisationShortName: 'SIEMENS',
    country: 'Germany',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Siemens-logo.svg/200px-Siemens-logo.svg.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 6,
    coordinates: { lat: 48.14, lng: 11.58 },
  },
  {
    id: 'demo-7',
    proposalId: 'demo',
    organisationName: 'InnoTech Solutions',
    organisationShortName: 'ITS',
    country: 'Netherlands',
    organisationType: 'beneficiary',
    isSme: true,
    participantNumber: 7,
    coordinates: { lat: 52.09, lng: 5.12 },
  },
  {
    id: 'demo-8',
    proposalId: 'demo',
    organisationName: 'University of Oxford',
    organisationShortName: 'OXFORD',
    country: 'United Kingdom',
    organisationType: 'associated_country_partner',
    isSme: false,
    participantNumber: 8,
    coordinates: { lat: 51.75, lng: -1.25 },
  },
];

// European country coordinates for the SVG map
const COUNTRY_PATHS: Record<string, { path: string; center: { x: number; y: number } }> = {
  'Germany': { 
    path: 'M280,180 L300,160 L320,170 L310,200 L290,210 L270,200 Z',
    center: { x: 295, y: 185 }
  },
  'France': { 
    path: 'M200,200 L250,180 L270,200 L260,240 L220,260 L180,240 L190,210 Z',
    center: { x: 225, y: 220 }
  },
  'Italy': { 
    path: 'M290,220 L310,210 L320,240 L300,290 L280,280 L290,250 Z',
    center: { x: 298, y: 255 }
  },
  'Sweden': { 
    path: 'M310,80 L330,60 L350,80 L340,140 L320,150 L300,120 Z',
    center: { x: 325, y: 105 }
  },
  'Greece': { 
    path: 'M350,280 L380,270 L390,290 L370,310 L350,300 Z',
    center: { x: 365, y: 290 }
  },
  'Netherlands': { 
    path: 'M260,160 L280,150 L285,165 L270,175 L255,170 Z',
    center: { x: 270, y: 162 }
  },
  'United Kingdom': { 
    path: 'M180,120 L220,100 L230,140 L210,170 L180,160 L170,140 Z',
    center: { x: 200, y: 140 }
  },
  'Spain': { 
    path: 'M120,240 L200,230 L210,280 L160,300 L100,280 L110,250 Z',
    center: { x: 155, y: 265 }
  },
  'Poland': { 
    path: 'M340,160 L380,150 L390,180 L370,200 L340,190 Z',
    center: { x: 365, y: 175 }
  },
  'Austria': { 
    path: 'M300,200 L330,195 L340,210 L320,220 L295,215 Z',
    center: { x: 317, y: 207 }
  },
  'Belgium': { 
    path: 'M245,175 L260,170 L265,185 L250,190 Z',
    center: { x: 255, y: 180 }
  },
  'Portugal': { 
    path: 'M100,260 L120,250 L125,290 L105,300 Z',
    center: { x: 112, y: 275 }
  },
  'Ireland': { 
    path: 'M150,130 L175,120 L180,145 L165,155 L145,145 Z',
    center: { x: 163, y: 137 }
  },
  'Finland': { 
    path: 'M360,50 L390,40 L400,80 L380,110 L350,100 L355,65 Z',
    center: { x: 375, y: 75 }
  },
  'Denmark': { 
    path: 'M285,130 L310,120 L315,145 L295,150 Z',
    center: { x: 300, y: 135 }
  },
};

const PARTNER_TYPE_COLORS: Record<ParticipantType, string> = {
  beneficiary: 'fill-primary',
  affiliated_entity: 'fill-blue-500',
  associated_partner: 'fill-emerald-500',
  third_party_against_payment: 'fill-amber-500',
  third_party_free_of_charge: 'fill-orange-500',
  subcontractor: 'fill-purple-500',
  international_partner: 'fill-cyan-500',
  associated_country_partner: 'fill-rose-500',
};

const PARTNER_TYPE_BG_COLORS: Record<ParticipantType, string> = {
  beneficiary: 'bg-primary',
  affiliated_entity: 'bg-blue-500',
  associated_partner: 'bg-emerald-500',
  third_party_against_payment: 'bg-amber-500',
  third_party_free_of_charge: 'bg-orange-500',
  subcontractor: 'bg-purple-500',
  international_partner: 'bg-cyan-500',
  associated_country_partner: 'bg-rose-500',
};

export function ConsortiumMap({ participants = DEMO_PARTICIPANTS, onGenerate }: ConsortiumMapProps) {
  const [categoryFilter, setCategoryFilter] = useState<ParticipantType | 'all'>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const filteredParticipants = useMemo(() => {
    if (categoryFilter === 'all') return participants;
    return participants.filter(p => p.organisationType === categoryFilter);
  }, [participants, categoryFilter]);

  // Group participants by country
  const participantsByCountry = useMemo(() => {
    const grouped: Record<string, typeof participants> = {};
    participants.forEach(p => {
      if (p.country) {
        if (!grouped[p.country]) grouped[p.country] = [];
        grouped[p.country].push(p);
      }
    });
    return grouped;
  }, [participants]);

  // Get unique partner types in the consortium
  const partnerTypes = useMemo(() => {
    const types = new Set(participants.map(p => p.organisationType));
    return Array.from(types);
  }, [participants]);

  const handleGenerateMap = async () => {
    setIsGenerating(true);
    // Simulate AI generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsGenerating(false);
    onGenerate?.();
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Consortium Map
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Partners</SelectItem>
                {partnerTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {PARTICIPANT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={handleGenerateMap}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              <span className="text-xs">Generate</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              <Download className="w-3 h-3" />
              <span className="text-xs">Export</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <TooltipProvider>
          <div className="relative">
            {/* SVG Map */}
            <svg viewBox="0 0 500 350" className="w-full h-auto border rounded-lg bg-muted/20">
              {/* Background */}
              <rect x="0" y="0" width="500" height="350" fill="hsl(var(--muted) / 0.3)" />
              
              {/* Country outlines */}
              {Object.entries(COUNTRY_PATHS).map(([country, data]) => {
                const hasPartners = participantsByCountry[country]?.some(
                  p => categoryFilter === 'all' || p.organisationType === categoryFilter
                );
                return (
                  <path
                    key={country}
                    d={data.path}
                    className={`stroke-border transition-colors ${
                      hasPartners ? 'fill-primary/20' : 'fill-muted/50'
                    }`}
                    strokeWidth="1"
                  />
                );
              })}

              {/* Partner markers */}
              {filteredParticipants.map((p, idx) => {
                const countryData = COUNTRY_PATHS[p.country || ''];
                if (!countryData) return null;

                // Offset markers in same country
                const countryPartners = participantsByCountry[p.country || ''] || [];
                const indexInCountry = countryPartners.findIndex(cp => cp.id === p.id);
                const offsetX = (indexInCountry % 3) * 15 - 15;
                const offsetY = Math.floor(indexInCountry / 3) * 15;

                const x = countryData.center.x + offsetX;
                const y = countryData.center.y + offsetY;

                return (
                  <Tooltip key={p.id}>
                    <TooltipTrigger asChild>
                      <g className="cursor-pointer">
                        {/* Marker circle */}
                        <circle
                          cx={x}
                          cy={y}
                          r="10"
                          className={`${PARTNER_TYPE_COLORS[p.organisationType]} stroke-background`}
                          strokeWidth="2"
                        />
                        {/* Partner number */}
                        <text
                          x={x}
                          y={y + 1}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-primary-foreground text-[8px] font-bold pointer-events-none"
                        >
                          {p.participantNumber}
                        </text>
                        {/* Label */}
                        {showLabels && (
                          <text
                            x={x}
                            y={y + 18}
                            textAnchor="middle"
                            className="fill-foreground text-[6px] font-medium pointer-events-none"
                          >
                            {p.organisationShortName}
                          </text>
                        )}
                      </g>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{p.organisationName}</p>
                        <p className="text-xs text-muted-foreground">{p.country}</p>
                        <Badge variant="outline" className="text-xs">
                          {PARTICIPANT_TYPE_LABELS[p.organisationType]}
                        </Badge>
                        {p.isSme && (
                          <Badge variant="secondary" className="text-xs ml-1">
                            SME
                          </Badge>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3">
              {partnerTypes.map(type => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${PARTNER_TYPE_BG_COLORS[type]}`} />
                  <span className="text-xs text-muted-foreground">{PARTICIPANT_TYPE_LABELS[type]}</span>
                </div>
              ))}
            </div>

            {/* Partner List */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {filteredParticipants.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card text-xs"
                >
                  <div className={`w-6 h-6 rounded-full ${PARTNER_TYPE_BG_COLORS[p.organisationType]} flex items-center justify-center text-primary-foreground font-bold text-[10px]`}>
                    {p.participantNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.organisationShortName || p.organisationName}</p>
                    <p className="text-muted-foreground truncate">{p.country}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
