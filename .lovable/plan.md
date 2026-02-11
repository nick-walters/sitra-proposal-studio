

## Fix: Characters lost when typing fast in form fields

### Problem
Multiple form components call their parent's update handler on **every keystroke** without local state buffering. This triggers parent state updates and re-renders, which can overwrite the input value mid-typing, causing characters to be dropped during fast input.

### Root Cause
The anti-pattern looks like this:
```
<Input
  value={participant.organisationName || ''}
  onChange={(e) => handleFieldUpdate('organisationName', e.target.value)}
/>
```
Here, `handleFieldUpdate` immediately calls the parent (`onUpdateParticipant`), which updates parent state, which re-renders this component with new props -- but during fast typing, React batching can cause the input to "reset" to a stale value before the next keystroke is processed.

### Solution: Create a reusable `DebouncedInput` and `DebouncedTextarea` component
Instead of fixing each component individually (which would be error-prone and repetitive), create two shared wrapper components that:
1. Maintain **local state** for immediate responsiveness
2. **Debounce** the parent callback (500ms delay)
3. **Sync from props** only when the input is not focused (to avoid overwriting user input)

### Affected Components (files to update)

1. **`src/components/ParticipantDetailForm.tsx`** -- Organisation details fields (legal name, short name, English name, street, town, postcode, website) all call `handleFieldUpdate` directly on every keystroke
2. **`src/components/participant/MainContactSection.tsx`** -- All 11+ input fields call `onUpdate` directly per keystroke
3. **`src/components/participant/DepartmentsSection.tsx`** -- Department name, street, town, postcode fields call `onUpdate` directly per keystroke

These are the primary offenders. Other components (WPRisksTable, WPDeliverablesTable, B31TablesEditor, WPEffortMatrix) already use the correct local-state + debounce pattern.

### Technical Details

**Step 1: Create `src/components/ui/debounced-input.tsx`**

A reusable component wrapping `Input`:
- Uses `useState` for local value
- Uses `useRef` to track focus state
- Debounces `onChange` callback with `setTimeout` (500ms)
- Only syncs from external `value` prop when the field is **not focused**

```typescript
// Pseudocode
function DebouncedInput({ value, onDebouncedChange, debounceMs = 500, ...props }) {
  const [localValue, setLocalValue] = useState(value);
  const isFocused = useRef(false);
  const timeoutRef = useRef(null);

  // Sync from props only when not focused
  useEffect(() => {
    if (!isFocused.current) setLocalValue(value);
  }, [value]);

  const handleChange = (e) => {
    setLocalValue(e.target.value);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onDebouncedChange(e.target.value);
    }, debounceMs);
  };

  return <Input value={localValue} onChange={handleChange}
    onFocus={() => isFocused.current = true}
    onBlur={() => { isFocused.current = false; /* flush pending */ }}
  />;
}
```

Similarly create `DebouncedTextarea` with the same logic.

**Step 2: Replace direct `onChange` calls in affected components**

In each affected file, replace:
```tsx
<Input value={x} onChange={(e) => onUpdate('field', e.target.value)} />
```
with:
```tsx
<DebouncedInput value={x} onDebouncedChange={(v) => onUpdate('field', v)} />
```

This is a mechanical find-and-replace within each file, keeping all other props (placeholder, disabled, className) unchanged.

**Step 3: Verify existing good patterns are untouched**

Components that already use local state + debounce (WPRisksTable, WPDeliverablesTable, B31TablesEditor, WPEffortMatrix) will not be modified.

### Summary of Changes

| File | Change |
|------|--------|
| `src/components/ui/debounced-input.tsx` | New file -- DebouncedInput component |
| `src/components/ui/debounced-textarea.tsx` | New file -- DebouncedTextarea component |
| `src/components/ParticipantDetailForm.tsx` | Replace ~7 Input fields with DebouncedInput |
| `src/components/participant/MainContactSection.tsx` | Replace ~11 Input fields with DebouncedInput |
| `src/components/participant/DepartmentsSection.tsx` | Replace ~4 Input fields with DebouncedInput |

