import { useMemo } from 'react';
import { StorageImage } from '@/components/StorageImage';
import { Participant } from '@/types/proposal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { B31Pill, WPBubble, ParticipantBubble } from '@/components/B31Pill';

// WP Leadership info type
export interface WPLeadershipInfo {
  wpNumber: number;
  color: string;
  shortName?: string;
}

// Case Leadership info type
export interface CaseLeadershipInfo {
  caseNumber: number;
  color: string;
  shortName?: string;
  prefix: string; // CS, UC, LL, P, D, C
}

interface ParticipantListTableProps {
  participants: Participant[];
  wpLeadership?: Record<string, WPLeadershipInfo[]>;
  caseLeadership?: Record<string, CaseLeadershipInfo[]>;
  caption?: string;
  onRowClick?: (participant: Participant) => void;
}

// Convert name to name case (capitalize first letter of each word)
function toNameCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * A read-only participant list table styled to match Part B editor tables.
 * Uses the same ProseMirror table styling for consistency between editor and export.
 */
export function ParticipantListTable({
  participants,
  wpLeadership = {},
  caseLeadership = {},
  caption,
  onRowClick,
}: ParticipantListTableProps) {
  // Sort participants by participantNumber
  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      return (a.participantNumber || 999) - (b.participantNumber || 999);
    });
  }, [participants]);

  if (participants.length === 0) {
    return (
      <div className="text-muted-foreground italic text-sm py-4">
        No participants added yet.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="ProseMirror">
        {/* Table caption above the table */}
        {caption && (
          <p className="table-caption">
            <em><strong>{caption}</strong></em>
          </p>
        )}
        
        {/* Table styled like Part B ProseMirror tables */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '5%' }}>No.</th>
              <th style={{ width: '12%' }}>Short name</th>
              <th style={{ width: '40%' }}>Legal name</th>
              <th style={{ width: '8%' }}>Logo</th>
              <th style={{ width: '15%' }}>Lead roles</th>
              <th style={{ width: '20%' }}>Country</th>
            </tr>
          </thead>
          <tbody>
            {sortedParticipants.map((participant) => {
              const wpLead = wpLeadership[participant.id] || [];
              const caseLead = caseLeadership[participant.id] || [];
              
              return (
                <tr 
                  key={participant.id}
                  onClick={() => onRowClick?.(participant)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  className={onRowClick ? 'hover:bg-muted/30' : ''}
                >
                  {/* Number */}
                  <td style={{ textAlign: 'center' }}>
                    <p>{participant.participantNumber}</p>
                  </td>
                  
                  {/* Short name - as bubble (black bg, white italic bold text) */}
                  <td>
                    <p>
                      {participant.organisationShortName ? (
                        <ParticipantBubble style={{ fontSize: '11pt', height: 'auto', padding: '4px 10px' }}>
                          {participant.organisationShortName}
                        </ParticipantBubble>
                      ) : (
                        '—'
                      )}
                    </p>
                  </td>
                  
                  {/* Legal name + English name */}
                  <td>
                    <p>
                      <span className="font-medium">
                        {participant.organisationName}
                      </span>
                    </p>
                    {participant.englishName && 
                     participant.englishName.trim() && 
                     participant.englishName.trim().toLowerCase() !== participant.organisationName.trim().toLowerCase() && (
                      <p>
                        <span className="italic" style={{ color: '#666' }}>
                          {participant.englishName}
                        </span>
                      </p>
                    )}
                  </td>
                  
                  {/* Logo */}
                  <td style={{ textAlign: 'center' }}>
                    {participant.logoUrl ? (
                      <StorageImage 
                        storedPath={participant.logoUrl} 
                        alt="" 
                        style={{ 
                          maxWidth: '32px', 
                          maxHeight: '32px', 
                          objectFit: 'contain',
                          display: 'inline-block',
                        }}
                      />
                    ) : (
                      <p>—</p>
                    )}
                  </td>
                  
                  {/* Role badges */}
                  <td>
                    <p>
                      <span className="inline-flex flex-wrap gap-1">
                        {participant.participantNumber === 1 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <B31Pill
                                variant="filled"
                                color="hsl(var(--primary))"
                                textColor="hsl(var(--primary-foreground))"
                                style={{ fontSize: '11pt', height: 'auto', padding: '4px 10px', fontWeight: 500, borderRadius: '4px' }}
                              >
                                Coord
                              </B31Pill>
                            </TooltipTrigger>
                            <TooltipContent>Project coordinator</TooltipContent>
                          </Tooltip>
                        )}
                        
                        {wpLead.map((wp) => (
                          <Tooltip key={`wp-${wp.wpNumber}`}>
                            <TooltipTrigger asChild>
                              <WPBubble
                                wpColor={wp.color}
                                style={{ fontSize: '11pt', height: 'auto', padding: '4px 10px' }}
                              >
                                WP{wp.wpNumber}
                              </WPBubble>
                            </TooltipTrigger>
                            <TooltipContent>
                              {wp.shortName ? `${wp.shortName} (Lead)` : `WP${wp.wpNumber} Lead`}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        
                        {caseLead.map((c) => (
                          <Tooltip key={`case-${c.caseNumber}`}>
                            <TooltipTrigger asChild>
                              <B31Pill
                                variant="outline"
                                color="#000000"
                                style={{ fontSize: '11pt', height: 'auto', padding: '4px 10px' }}
                              >
                                {c.prefix ? `${c.prefix}${c.caseNumber}` : (c.shortName || c.caseNumber)}
                              </B31Pill>
                            </TooltipTrigger>
                            <TooltipContent>
                              {c.shortName ? `${c.shortName} (Lead)` : `${c.prefix ? `${c.prefix}${c.caseNumber}` : c.caseNumber} Lead`}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        
                        {participant.participantNumber !== 1 && wpLead.length === 0 && caseLead.length === 0 && (
                          <span>—</span>
                        )}
                      </span>
                    </p>
                  </td>
                  
                  {/* Country */}
                  <td>
                    <p>{participant.country || '—'}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
