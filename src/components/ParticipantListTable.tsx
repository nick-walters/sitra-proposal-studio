import { useMemo } from 'react';
import { Participant } from '@/types/proposal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
              <th style={{ width: '15%' }}>Role</th>
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
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-[11pt]"
                          style={{ 
                            backgroundColor: '#000000', 
                            color: '#ffffff',
                            fontWeight: 'bold',
                            fontStyle: 'italic',
                          }}
                        >
                          {participant.organisationShortName}
                        </span>
                      ) : (
                        '—'
                      )}
                    </p>
                  </td>
                  
                  {/* Legal name + English name */}
                  <td>
                    <p>
                      <span className="font-medium">
                        {toNameCase(participant.organisationName)}
                      </span>
                    </p>
                    {participant.englishName && 
                     participant.englishName.trim() && 
                     participant.englishName.trim().toLowerCase() !== participant.organisationName.trim().toLowerCase() && (
                      <p>
                        <span className="italic" style={{ color: '#666' }}>
                          {toNameCase(participant.englishName)}
                        </span>
                      </p>
                    )}
                  </td>
                  
                  {/* Logo */}
                  <td style={{ textAlign: 'center' }}>
                    {participant.logoUrl ? (
                      <img 
                        src={participant.logoUrl} 
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
                        {/* Coordinator badge for first participant */}
                        {participant.participantNumber === 1 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span 
                                className="inline-flex items-center px-2.5 py-1 rounded text-[11pt] font-medium"
                                style={{ 
                                  backgroundColor: 'hsl(var(--primary))', 
                                  color: 'hsl(var(--primary-foreground))',
                                }}
                              >
                                Coord
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Project Coordinator</TooltipContent>
                          </Tooltip>
                        )}
                        
                        {/* WP leadership badges */}
                        {wpLead.map((wp) => (
                          <Tooltip key={`wp-${wp.wpNumber}`}>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11pt] font-bold text-white"
                                style={{ backgroundColor: wp.color }}
                              >
                                WP{wp.wpNumber}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {wp.shortName ? `${wp.shortName} (Lead)` : `WP${wp.wpNumber} Lead`}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        
                        {/* Case leadership badges */}
                        {caseLead.map((c) => (
                          <Tooltip key={`case-${c.caseNumber}`}>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11pt] font-bold text-white"
                                style={{ backgroundColor: c.color }}
                              >
                                {c.prefix}{c.caseNumber}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {c.shortName ? `${c.shortName} (Lead)` : `${c.prefix}${c.caseNumber} Lead`}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        
                        {/* Dash if no roles */}
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
