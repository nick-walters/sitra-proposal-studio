

# Enrich Logo Generation with Full Topic Description

## Changes

### 1. Add topic context prop to LogoUpload

Add an optional `topicContext?: string` prop to `LogoUploadProps` in `src/components/LogoUpload.tsx`.

### 2. Pass topic fields from GeneralInfoForm

In `src/components/GeneralInfoForm.tsx`, the proposal object already contains `topic_expected_outcome`, `topic_scope`, and `destination_description`. Concatenate all non-empty fields into a single string and pass it as `topicContext` to the `LogoUpload` component.

### 3. Update the AI prompt in handleGenerateLogo

In `LogoUpload.tsx`, replace the current keyword extraction (`proposalTitle.split(' ').slice(0, 3)`) with the full `topicContext` string -- no truncation. Update the prompt to instruct the model to distill the description into a single simple, bold symbol:

> "Create a simple, bold logo icon for '{acronym}'. [color instructions unchanged]. Flat design with no gradients, the graphic element must be as large as possible filling the entire square canvas edge-to-edge with zero padding. The logo must be a single abstract geometric or symbolic shape -- keep it extremely simple despite the detailed description below. Distill the following project description into one iconic visual concept: {topicContext}. Professional and modern, suitable for EU research project. No text, no letters, just one iconic symbol. The design must bleed to all edges of the canvas with no whitespace border."

Key points:
- The full untruncated topic description is sent to the AI model
- The prompt explicitly instructs simplicity ("single abstract geometric shape", "extremely simple despite the detailed description", "one iconic visual concept")
- All existing color logic (acronym segment colors, 2-color fallback) remains unchanged
- The proposal title is no longer used as the theme source

### Technical details

**`src/components/LogoUpload.tsx`**
- Add `topicContext?: string` to the props interface
- In `handleGenerateLogo`, replace `const keywords = proposalTitle.split(' ').slice(0, 3).join(' ')` with usage of `topicContext` (falling back to `proposalTitle` if topic context is empty)
- Rewrite the prompt string as described above

**`src/components/GeneralInfoForm.tsx`**
- Where `LogoUpload` is rendered, build the topic context string from the proposal's `topic_expected_outcome`, `topic_scope`, and `destination_description` fields
- Pass it as `topicContext={topicContext}` to `LogoUpload`

No database or edge function changes required.

