

# Two-Column Grid Layout for WP Bubbles in Left Navigation

## Overview
This change will restructure the WP (work package) bubbles under the "WP Drafts" section in the left navigation panel to display in a two-column grid layout instead of a vertical list. This saves vertical space when there are many work packages.

## Current Behavior
WP bubbles display as a vertical list:
```
WP Drafts
  WP1: Project Mgmt
  WP2: Research
  WP3: Development
  WP4: Testing
  WP5: Dissemination
  WP6: Exploitation
```

## Proposed Layout
WP bubbles will display in a two-column grid:
```
WP Drafts
  WP1: Proj Mgmt    WP2: Research
  WP3: Development  WP4: Testing
  WP5: Dissem...    WP6: Exploit...
```

## Implementation Approach

The `SectionNavigator.tsx` component needs to be modified to handle WP sections differently when they are children of the "WP Drafts" section. Instead of rendering each WP as a separate `SectionItem`, we'll create a special grid container for WP bubbles.

### Key Changes

1. **Detect WP parent context**: Add logic to identify when we're rendering subsections of the "WP Drafts" section

2. **Create a grid wrapper**: For WP subsections, render them inside a CSS grid container with `grid-cols-2` (two columns)

3. **Simplify WP bubble rendering**: Since WP items in the grid won't need expansion arrows or assignment indicators (they're leaf nodes), create a compact clickable bubble component

4. **Handle text overflow**: Use `truncate` styling so long WP titles are truncated with ellipsis to fit the narrower column width

5. **Preserve active state**: Maintain visual highlighting for the currently selected WP

### Same Treatment for Participant Bubbles
Apply identical grid layout to participant bubbles under the A2 section, displaying them as:
```
A2 Participants
  P1: Partner A    P2: Partner B
  P3: Partner C    P4: Partner D
```

---

## Technical Details

### File: `src/components/SectionNavigator.tsx`

**Add grid rendering logic in the subsections area** (around lines 331-346):

When the parent section is "WP Drafts" (`section.id === 'wp-drafts'`) or "A2" (`section.id === 'a2'`), render children in a grid:

```tsx
{hasSubsections && isExpanded && (
  <div className="animate-slide-in-left">
    {/* Check if children are WP sections or participant sections */}
    {section.id === 'wp-drafts' || section.id === 'a2' ? (
      <div 
        className="grid grid-cols-2 gap-1 px-2 py-1"
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        {section.subsections!.map((subsection) => {
          const wpSub = subsection as WPSection;
          const isWP = wpSub.wpId !== undefined;
          const isParticipant = subsection.id.startsWith('a2-');
          const isSubActive = activeSectionId === subsection.id;
          
          return (
            <button
              key={subsection.id}
              className={cn(
                "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold truncate cursor-pointer transition-all",
                isSubActive && "ring-2 ring-primary ring-offset-1"
              )}
              style={{ 
                backgroundColor: isWP ? wpSub.wpColor : '#000000',
                color: '#ffffff' 
              }}
              onClick={() => onSectionClick(subsection)}
            >
              {isWP 
                ? `WP${wpSub.wpNumber}: ${wpSub.title}`
                : `P${subsection.number}: ${subsection.title}`
              }
            </button>
          );
        })}
      </div>
    ) : (
      /* Regular vertical list for other subsections */
      section.subsections!.map((subsection) => (
        <SectionItem ... />
      ))
    )}
  </div>
)}
```

**Additional considerations**:
- Add tooltip on hover showing full WP/participant name (useful when truncated)
- Maintain proper indentation to align with parent section depth
- Ensure clicking a bubble navigates to that WP/participant section
- Handle the "active" state with a ring or border highlight

### Visual Summary

```text
Before (vertical):           After (2-column grid):
+-----------------------+    +-----------------------+
| WP Drafts       [v]   |    | WP Drafts       [v]   |
|   WP1: Coordination   |    |   WP1:Coord  WP2:Res  |
|   WP2: Research       |    |   WP3:Dev    WP4:Test |
|   WP3: Development    |    |   WP5:Diss   WP6:Expl |
|   WP4: Testing        |    +-----------------------+
|   WP5: Dissemination  |
|   WP6: Exploitation   |
+-----------------------+
```

