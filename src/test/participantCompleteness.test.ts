import { describe, it, expect } from 'vitest';
import { isEligibleForGEP } from '@/lib/countries';

// Extract participant completeness logic for testing
interface ParticipantData {
  id: string;
  participant_number: number;
  organisation_name: string | null;
  organisation_short_name: string | null;
  country: string | null;
  legal_entity_type: string | null;
  pic_number: string | null;
  contact_email: string | null;
  main_contact_first_name: string | null;
  main_contact_last_name: string | null;
  street: string | null;
  town: string | null;
  postcode: string | null;
  organisation_category: string | null;
}

interface CompletionIssue {
  participantNumber: number;
  participantName: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

function checkParticipantCompleteness(
  participants: ParticipantData[],
  memberCounts: Record<string, number>,
): CompletionIssue[] {
  const found: CompletionIssue[] = [];

  participants.forEach(p => {
    const name = p.organisation_short_name || p.organisation_name || `Participant ${p.participant_number}`;
    const num = p.participant_number;

    if (!p.organisation_name?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'Legal name', severity: 'error', message: 'Legal name is required' });
    if (!p.organisation_short_name?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'Short name', severity: 'error', message: 'Short name is required' });
    if (!p.country?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'Country', severity: 'error', message: 'Country is required' });
    if (!p.legal_entity_type?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'Legal entity type', severity: 'error', message: 'Legal entity type is required' });
    if (!p.pic_number?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'PIC', severity: 'warning', message: 'PIC number is missing' });
    if (!p.contact_email?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'Email', severity: 'warning', message: 'Contact email is missing' });
    if (!p.main_contact_first_name?.trim() && !p.main_contact_last_name?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'Contact person', severity: 'warning', message: 'Main contact person is missing' });
    if (!p.street?.trim() || !p.town?.trim() || !p.postcode?.trim())
      found.push({ participantNumber: num, participantName: name, field: 'Address', severity: 'warning', message: 'Address is incomplete' });

    const gepEligible = ['HES', 'RES', 'PUB'].includes(p.organisation_category || '') && isEligibleForGEP(p.country || '');
    if (gepEligible)
      found.push({ participantNumber: num, participantName: name, field: 'GEP', severity: 'warning', message: 'Ensure Gender Equality Plan is provided' });

    if ((memberCounts[p.id] || 0) === 0)
      found.push({ participantNumber: num, participantName: name, field: 'Team', severity: 'warning', message: 'No team members added' });
  });

  found.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.participantNumber - b.participantNumber;
  });

  return found;
}

const mkParticipant = (overrides: Partial<ParticipantData> = {}): ParticipantData => ({
  id: 'p1',
  participant_number: 1,
  organisation_name: 'Test University',
  organisation_short_name: 'TU',
  country: 'Germany',
  legal_entity_type: 'HES',
  pic_number: '123456789',
  contact_email: 'test@example.com',
  main_contact_first_name: 'John',
  main_contact_last_name: 'Doe',
  street: '123 Main St',
  town: 'Berlin',
  postcode: '10115',
  organisation_category: 'HES',
  ...overrides,
});

describe('Participant Completeness Checker', () => {
  it('returns no issues for complete participant', () => {
    const issues = checkParticipantCompleteness([mkParticipant()], { p1: 2 });
    // May have GEP warning for HES in EU country
    const errors = issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('flags missing legal name as error', () => {
    const p = mkParticipant({ organisation_name: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'Legal name' && i.severity === 'error')).toBe(true);
  });

  it('flags missing short name as error', () => {
    const p = mkParticipant({ organisation_short_name: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'Short name' && i.severity === 'error')).toBe(true);
  });

  it('flags missing country as error', () => {
    const p = mkParticipant({ country: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'Country' && i.severity === 'error')).toBe(true);
  });

  it('flags missing PIC as warning', () => {
    const p = mkParticipant({ pic_number: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'PIC' && i.severity === 'warning')).toBe(true);
  });

  it('flags missing contact email as warning', () => {
    const p = mkParticipant({ contact_email: null });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'Email' && i.severity === 'warning')).toBe(true);
  });

  it('flags missing contact person when both names empty', () => {
    const p = mkParticipant({ main_contact_first_name: '', main_contact_last_name: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'Contact person')).toBe(true);
  });

  it('does not flag contact person when only first name present', () => {
    const p = mkParticipant({ main_contact_first_name: 'Jane', main_contact_last_name: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'Contact person')).toBe(false);
  });

  it('flags incomplete address', () => {
    const p = mkParticipant({ postcode: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    expect(issues.some(i => i.field === 'Address')).toBe(true);
  });

  it('flags no team members', () => {
    const issues = checkParticipantCompleteness([mkParticipant()], { p1: 0 });
    expect(issues.some(i => i.field === 'Team')).toBe(true);
  });

  it('does not flag team when members exist', () => {
    const issues = checkParticipantCompleteness([mkParticipant()], { p1: 3 });
    expect(issues.some(i => i.field === 'Team')).toBe(false);
  });

  it('sorts errors before warnings', () => {
    const p = mkParticipant({ organisation_name: '', pic_number: '' });
    const issues = checkParticipantCompleteness([p], { p1: 1 });
    const firstError = issues.findIndex(i => i.severity === 'error');
    const firstWarning = issues.findIndex(i => i.severity === 'warning');
    if (firstError !== -1 && firstWarning !== -1) {
      expect(firstError).toBeLessThan(firstWarning);
    }
  });

  it('handles null values gracefully', () => {
    const p = mkParticipant({
      organisation_name: null,
      organisation_short_name: null,
      country: null,
      legal_entity_type: null,
      pic_number: null,
      contact_email: null,
      main_contact_first_name: null,
      main_contact_last_name: null,
      street: null,
      town: null,
      postcode: null,
    });
    const issues = checkParticipantCompleteness([p], {});
    expect(issues.length).toBeGreaterThan(0);
  });

  it('uses participant number in fallback name', () => {
    const p = mkParticipant({ organisation_short_name: null, organisation_name: null, participant_number: 5 });
    const issues = checkParticipantCompleteness([p], {});
    expect(issues[0].participantName).toBe('Participant 5');
  });
});
