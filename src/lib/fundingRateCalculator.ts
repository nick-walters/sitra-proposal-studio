import { ProposalType } from '@/types/proposal';

export type ParticipantCategory = 'academic' | 'company' | 'research_org' | 'public_body';

interface FundingRateContext {
  actionType: ProposalType;
  participantType: ParticipantCategory;
  workProgramme?: string;
  isSME?: boolean;
}

interface FundingRateRule {
  conditions: Partial<FundingRateContext>;
  rate: number;
  priority: number;
  description: string;
}

// Default funding rules (can be overridden by database rules)
const DEFAULT_FUNDING_RULES: FundingRateRule[] = [
  // Highest priority: Programme-specific overrides
  {
    conditions: { actionType: 'IA', participantType: 'company', workProgramme: 'CBE_JU' },
    rate: 0.60,
    priority: 100,
    description: 'CBE JU IA - Companies receive 60%',
  },
  
  // Standard IA rules
  {
    conditions: { actionType: 'IA', participantType: 'company' },
    rate: 0.70,
    priority: 20,
    description: 'Standard IA - Companies receive 70%',
  },
  {
    conditions: { actionType: 'IA', participantType: 'academic' },
    rate: 1.00,
    priority: 20,
    description: 'Standard IA - Academic/non-profit receive 100%',
  },
  {
    conditions: { actionType: 'IA', participantType: 'research_org' },
    rate: 1.00,
    priority: 20,
    description: 'Standard IA - Research organisations receive 100%',
  },
  {
    conditions: { actionType: 'IA', participantType: 'public_body' },
    rate: 1.00,
    priority: 20,
    description: 'Standard IA - Public bodies receive 100%',
  },
  
  // RIA rules - all 100%
  {
    conditions: { actionType: 'RIA' },
    rate: 1.00,
    priority: 10,
    description: 'RIA - All participants receive 100%',
  },
  
  // CSA rules - all 100%
  {
    conditions: { actionType: 'CSA' },
    rate: 1.00,
    priority: 10,
    description: 'CSA - All participants receive 100%',
  },
];

/**
 * Calculate the funding rate for a participant based on context.
 * Uses priority-based rule matching - highest priority matching rule wins.
 */
export function calculateFundingRate(
  context: FundingRateContext,
  customRules?: FundingRateRule[]
): { rate: number; description: string } {
  const rules = customRules || DEFAULT_FUNDING_RULES;
  
  // Sort by priority (highest first)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  
  for (const rule of sortedRules) {
    const { conditions } = rule;
    let matches = true;
    
    // Check each condition - if specified in rule, it must match
    if (conditions.actionType && conditions.actionType !== context.actionType) {
      matches = false;
    }
    if (conditions.participantType && conditions.participantType !== context.participantType) {
      matches = false;
    }
    if (conditions.workProgramme && conditions.workProgramme !== context.workProgramme) {
      matches = false;
    }
    
    if (matches) {
      return {
        rate: rule.rate,
        description: rule.description,
      };
    }
  }
  
  // Default fallback
  return {
    rate: 1.00,
    description: 'Default funding rate (100%)',
  };
}

/**
 * Convert legal entity type to participant category for funding calculation.
 */
export function mapLegalEntityToCategory(
  legalEntityType?: string,
  isSME?: boolean
): ParticipantCategory {
  if (!legalEntityType) return 'company'; // Default assumption
  
  const normalized = legalEntityType.toLowerCase();
  
  if (normalized.includes('university') || 
      normalized.includes('academic') || 
      normalized.includes('higher education')) {
    return 'academic';
  }
  
  if (normalized.includes('research') || 
      normalized.includes('rto') ||
      normalized.includes('non-profit research')) {
    return 'research_org';
  }
  
  if (normalized.includes('public') || 
      normalized.includes('government') ||
      normalized.includes('ministry') ||
      normalized.includes('agency')) {
    return 'public_body';
  }
  
  // Companies (including SMEs)
  return 'company';
}

/**
 * Format funding rate as percentage string.
 */
export function formatFundingRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Calculate total EU contribution for a budget item.
 */
export function calculateEUContribution(
  eligibleCost: number,
  fundingRate: number
): number {
  return eligibleCost * fundingRate;
}
