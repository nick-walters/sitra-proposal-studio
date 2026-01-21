// Shared sample proposal data for demo/development purposes
// Used by Dashboard and ProposalMultiSelect components

export interface SampleProposalBasic {
  id: string;
  acronym: string;
  title: string;
}

// Basic proposal info for dropdowns/selects
export const SAMPLE_PROPOSALS_BASIC: SampleProposalBasic[] = [
  { id: '1', acronym: 'GreenTech', title: 'Green technologies for sustainable urban development' },
  { id: '2', acronym: 'HealthAI', title: 'Artificial intelligence solutions for personalized healthcare' },
  { id: '3', acronym: 'CleanEnergy', title: 'Coordination network for clean energy transition in Europe' },
  { id: '4', acronym: 'BioSmart', title: 'Smart bioeconomy solutions for circular agriculture' },
  { id: '5', acronym: 'CyberShield', title: 'Advanced cybersecurity framework for critical infrastructure' },
  { id: '6', acronym: 'FoodSafe', title: 'Innovative food safety monitoring systems' },
  { id: '7', acronym: 'QuantumNet', title: 'Quantum communication networks for secure data transmission' },
  { id: '8', acronym: 'HealthData', title: 'European Health Data Space integration platform' },
  { id: '9', acronym: 'AquaSense', title: 'Smart water quality monitoring for urban water systems' },
];
