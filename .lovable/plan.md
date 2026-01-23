

# Plan: Integrate TIC.io API for EC Participant Lookup

## Overview
Replace the unreliable CORDIS HTML scraping with the TIC.io REST API, which provides direct access to EC Participant Register data. This will enable reliable PIC lookups and organisation name searches.

## Requirements
- **TIC.io API Key**: You'll need to create a free account at TIC.io to obtain an API key
- The free tier provides 2,000 API calls per month, which should be sufficient for proposal preparation

---

## Implementation Steps

### Step 1: Configure TIC.io API Secret
Add the TIC.io API key as a backend secret so it can be used securely in the lookup function.

### Step 2: Update the lookup-pic Edge Function
Modify `supabase/functions/lookup-pic/index.ts` to:

1. **Add TIC.io PIC lookup function**
   - Call `https://api.tic.io/datasets/european-commission/participant-register/{pic}`
   - Map the response fields to our `OrganisationInfo` interface
   - Handle API errors gracefully

2. **Add TIC.io name search function** (if needed)
   - Use TIC.io's company search endpoint with EC Participant filter
   - Return matching organisations for name-based queries

3. **Update the lookup hierarchy**
   - First: Check local database (fast, no API calls)
   - Second: Query TIC.io API (reliable external source)
   - Third: Fall back to manual entry suggestion

### Step 3: Map TIC.io Response to Existing Interface

```typescript
// TIC.io response mapping
interface TicIoParticipant {
  pic: number;
  legalName: string;
  businessName?: string;
  countryName: string;
  countryCodeAlpha2: string;
  vat?: string;
  address?: string;
  status?: string;
}

// Map to our OrganisationInfo
function mapTicIoToOrganisationInfo(tic: TicIoParticipant): OrganisationInfo {
  return {
    picNumber: String(tic.pic),
    legalName: tic.legalName,
    shortName: tic.businessName, // Use business name as short name if available
    country: tic.countryName,
    countryCode: tic.countryCodeAlpha2,
    isSme: false, // TIC.io may not provide this; default to false
    organisationCategory: 'OTH', // Would need additional logic or user input
  };
}
```

---

## Technical Details

### Edge Function Changes

**File: `supabase/functions/lookup-pic/index.ts`**

1. Add new function `lookupPicFromTicIo(pic: string)`:
   - Fetch from TIC.io API with authentication header
   - Parse response and map to `OrganisationInfo`
   - Return null on 404 or errors

2. Replace `lookupPicFromCordis` calls with `lookupPicFromTicIo`:
   - Remove the HTML scraping logic
   - Use clean REST API calls instead

3. Add error handling for:
   - Missing API key configuration
   - Rate limiting (429 responses)
   - Invalid PIC format

### Secret Configuration
- Secret name: `TIC_IO_API_KEY`
- Usage: `Deno.env.get('TIC_IO_API_KEY')`

---

## Benefits
- **Reliable lookups**: REST API vs unreliable HTML scraping
- **Better data quality**: Official EC Participant Register data
- **Name search support**: Find organisations without knowing PIC
- **Free tier**: 2,000 calls/month at no cost

## Next Steps After Implementation
1. Test with known PICs (e.g., Sitra: 631524, Aalto: 988145985)
2. Verify data mapping is correct
3. Consider caching successful lookups in local database to reduce API calls

