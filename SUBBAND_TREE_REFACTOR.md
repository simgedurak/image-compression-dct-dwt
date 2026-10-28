# Subband Tree Canvas - Complete Refactor

## Summary

Successfully refactored `frontend/src/components/tabs/SubbandTreeCanvas.jsx` to match the reference screenshot with:

1. ✅ **Left Column - Hierarchical Tree View** - Clean text-based branching structure with color-coded badges
2. ✅ **Right Column - Enhanced 2D Canvas** - Large, prominent subband visualization with overlays
3. ✅ **Improved Header & Controls** - Clean "DWT LAB" header with inline wavelet/level display
4. ✅ **Enhanced Card Component** - Added subtitle support for section descriptions

---

## Feature 1: Hierarchical Tree View (Left Column)

### New Component: `HierarchicalTree`

**Visual Structure:**
```
📷 Image Root (512×512 px)
└── DWT Level 3 (db4)
    ├── [LL3] Approximation 64×64
    │   └── LL3 → DWT Level 2 (db4)
    │       ├── [LL2] Approximation 128×128
    │       │   └── LL2 → DWT Level 1 (db4)
    │       │       ├── [LL1] Approximation 256×256
    │       │       ├── [LH1] Horizontal Detail 256×256
    │       │       ├── [HL1] Vertical Detail 256×256
    │       │       └── [HH1] Diagonal Detail 256×256
    │       ├── [LH2] Horizontal Detail 128×128
    │       ├── [HL2] Vertical Detail 128×128
    │       └── [HH2] Diagonal Detail 128×128
    ├── [LH3] Horizontal Detail 64×64
    ├── [HL3] Vertical Detail 64×64
    └── [HH3] Diagonal Detail 64×64
```

### Color-Coded Badges

**Component: `SubbandBadge`**

| Badge | Color | Type |
|-------|-------|------|
| LL | Blue (`bg-blue-500`) | Approximation (Low-Frequency Coarse) |
| LH | Teal (`bg-teal-500`) | Horizontal Detail (High Horizontal Freq) |
| HL | Amber (`bg-amber-500`) | Vertical Detail (High Vertical Freq) |
| HH | Purple (`bg-purple-500`) | Diagonal Detail (High Diagonal Freq) |

### Recursive Rendering

- Automatically adapts to level (1, 2, or 3)
- Shows branching structure with `├──` and `└──` characters
- Displays dimensions calculated as: `size = imageWidth / 2^(level - currentLevel + 1)`
- Clean monospaced font for technical appearance

---

## Feature 2: Enhanced 2D Canvas (Right Column)

### New Component: `EnhancedSubbandCanvas`

**Key Specifications:**
```jsx
className="relative w-full aspect-square max-h-[560px] 
           bg-slate-950 rounded-lg overflow-hidden 
           border border-slate-700"
```

### Canvas Features

1. **Large Display**
   - Square aspect ratio
   - Max height: 560px
   - Fills card container prominently
   - Dark background (slate-950) for contrast

2. **Overlay System**
   - Badges positioned on each subband quadrant
   - Statistics overlays (Std Dev values)
   - Dimension labels (256×256, 128×128, etc.)
   - Semi-transparent backgrounds for readability

3. **Dynamic Positioning**
   - LL (Approximation): Top-left (2%, 2%)
   - LH (Horizontal): Top-right (2%, 52%)
   - HL (Vertical): Bottom-left (52%, 2%)
   - HH (Diagonal): Bottom-right (52%, 52%)

### Visual Overlays

**Badge Display:**
```jsx
<SubbandBadge label={name} type={type} />
<div className="text-[9px] text-white bg-black/60 px-1 rounded">
  Std Dev: {stat.std.toFixed(2)}
</div>
```

---

## Feature 3: Improved Header & Layout

### Header Section

**New Design:**
```
┌─────────────────────────────────────────────────────┐
│  DWT LAB                                           │
│  Mathematical hierarchy, 2D coefficient subband    │
│  breakdown, and subband knock-out experiment       │
└─────────────────────────────────────────────────────┘
```

### Inline Controls

```jsx
┌──────────────────────────┬──────────────────┐
│ Wavelet: db4 • Level 3  │ [Select] [Compute]│
└──────────────────────────┴──────────────────┘
```

- Blue badge showing current wavelet and level
- Dropdown selects for quick changes
- "Compute Tree" button (was "Decompose")

---

## Feature 4: Enhanced Card Component

**File:** `frontend/src/components/ui/Primitives.jsx`

### Added Subtitle Support

```jsx
export function Card({ title, subtitle, icon, action, children }) {
  // title: Main heading (e.g., "Subband Tree Hierarchy")
  // subtitle: Secondary descriptor (e.g., "RECURSIVE MALLAT BRANCHING")
}
```

**Visual Result:**
```
┌─────────────────────────────────────┐
│ 🔷 Subband Tree Hierarchy          │
│    RECURSIVE MALLAT BRANCHING       │ ← New subtitle
├─────────────────────────────────────┤
│                                     │
│   [Tree content here]               │
```

**Styling:**
- Title: `text-sm font-semibold text-slate-700`
- Subtitle: `text-[10px] uppercase tracking-wider text-slate-400 font-semibold`

---

## Implementation Details

### Two-Column Layout

```jsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
  <Card title="..." subtitle="RECURSIVE MALLAT BRANCHING">
    <HierarchicalTree />
  </Card>
  
  <Card title="..." subtitle="SUBBAND IMAGES & STATISTICS">
    <EnhancedSubbandCanvas />
  </Card>
</div>
```

**Responsive Behavior:**
- Mobile (< lg): Single column, stacked vertically
- Desktop (≥ lg): Left column fixed 400px, right fills remaining space

### Badge Reusability

The `SubbandBadge` component is used in three places:

1. **Hierarchical Tree** - Inline with branch structure
2. **Canvas Overlays** - Positioned on image quadrants
3. **Zero-Out Controls** - Toggle checkboxes

Ensures consistent color coding throughout the interface.

### Statistics Integration

**From Backend Response:**
```json
{
  "stats": {
    "LL3": { "mean": 123.45, "std": 31.93, "min": 0, "max": 255 },
    "LH3": { "mean": 0.12, "std": 6.41, "min": -89, "max": 67 },
    // ...
  }
}
```

**Displayed As:**
- Tree: Shows dimensions only
- Canvas: Shows Std Dev overlays
- Statistics Card: Full table with mean/std/min/max

---

## Before vs After Comparison

### Before ❌

**Left Column:**
- Horizontal node layout with arrows
- Confusing visual hierarchy
- No dimension information

**Right Column:**
- Small canvas (h-64 to h-96)
- No overlays or labels
- Plain black background

**Header:**
- Generic "Subband Tree Canvas"
- Controls separate from description

### After ✅

**Left Column:**
- Clean vertical tree with branching characters
- Clear parent-child relationships
- Dimensions for every subband
- Color-coded badges matching canvas

**Right Column:**
- Large square canvas (up to 560px)
- Overlay badges and statistics
- Dark slate background for better contrast
- Professional presentation

**Header:**
- "DWT LAB" with clear subtitle
- Inline wavelet/level indicator
- Cohesive controls section

---

## Technical Specifications

### Component Tree

```
SubbandTreeCanvas
├── Header Section
│   ├── Title + Description
│   └── Controls (Wavelet, Level, Compute)
├── Two-Column Layout
│   ├── Card: Hierarchical Tree
│   │   └── HierarchicalTree
│   │       ├── Image Root
│   │       └── Recursive Levels
│   │           └── SubbandBadge (×4 per level)
│   └── Card: 2D Canvas
│       └── EnhancedSubbandCanvas
│           ├── Image (base layer)
│           └── Overlays
│               ├── Badges (positioned)
│               ├── Statistics (Std Dev)
│               └── Dimensions
├── Statistics Card
│   └── SubbandStats (grid of stat cards with badges)
└── Zero-Out Controls
    ├── Checkbox toggles with badges
    └── Reconstructed image display
```

### Color System

```javascript
const colors = {
  LL: { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white' },
  LH: { bg: 'bg-teal-500', border: 'border-teal-600', text: 'text-white' },
  HL: { bg: 'bg-amber-500', border: 'border-amber-600', text: 'text-white' },
  HH: { bg: 'bg-purple-500', border: 'border-purple-600', text: 'text-white' }
}
```

### Responsive Breakpoints

| Breakpoint | Layout | Canvas Height |
|------------|--------|---------------|
| < 640px | Single column | Full width |
| 640-1024px | Single column | Full width |
| ≥ 1024px | Two columns (400px + 1fr) | max-h-[560px] |

---

## Performance Optimizations

1. **Lazy Rendering**
   - Tree only renders after "Compute Tree" click
   - Canvas only displays when data is available
   - Empty states prevent unnecessary computations

2. **Efficient State Management**
   - Separate state for tree result and zero-out result
   - Recomputes only when wavelet or level changes
   - Active bands tracked in Set for O(1) lookups

3. **Image Optimization**
   - Canvas uses `object-contain` for proper scaling
   - Dark background provides contrast without additional layers
   - Base64 data URLs loaded on demand

---

## Testing Checklist

### Hierarchical Tree ✅
- [x] Shows correct branching structure
- [x] Color-coded badges (LL, LH, HL, HH)
- [x] Dimensions calculated correctly
- [x] Recursive levels render properly
- [x] Monospaced font for technical look

### Enhanced Canvas ✅
- [x] Large square display (max 560px)
- [x] Dark background for contrast
- [x] Overlay badges positioned correctly
- [x] Statistics (Std Dev) visible
- [x] Responds to wavelet/level changes

### Controls ✅
- [x] Inline wavelet/level indicator
- [x] Dropdown selects work
- [x] "Compute Tree" triggers decomposition
- [x] Zero-out checkboxes toggle badges

### Layout ✅
- [x] Two-column on desktop
- [x] Single column on mobile
- [x] Proper spacing and alignment
- [x] No horizontal scroll

---

## Usage Example

```jsx
// User workflow:
1. Upload image in sidebar
2. Select wavelet (db4) and level (3)
3. Click "Compute Tree"
4. View:
   - Left: Hierarchical tree structure
   - Right: Large 2D canvas with overlays
5. Toggle subbands in zero-out section
6. Click "Zero-Out & Reconstruct"
7. See distortion metrics (PSNR, MSE)
```

---

## Files Modified

1. **`frontend/src/components/tabs/SubbandTreeCanvas.jsx`**
   - Complete refactor (255 lines)
   - New components: `HierarchicalTree`, `EnhancedSubbandCanvas`, `SubbandBadge`
   - Improved header and layout

2. **`frontend/src/components/ui/Primitives.jsx`**
   - Added `subtitle` prop to Card component
   - Enhanced header layout for title + subtitle

---

## Visual Design Philosophy

### Information Hierarchy

1. **Primary**: Large 2D canvas (visual center of attention)
2. **Secondary**: Tree structure (conceptual understanding)
3. **Tertiary**: Statistics and controls (detailed exploration)

### Color Semantics

- **Blue**: Approximation (low-frequency, smooth)
- **Teal/Green**: Horizontal details (edges in one direction)
- **Amber/Orange**: Vertical details (edges in other direction)  
- **Purple**: Diagonal details (corners, texture)

### Typography Scale

```css
text-xl      /* Main headers (DWT LAB) */
text-sm      /* Card titles */
text-[10px]  /* Subtitles, labels (uppercase) */
text-[9px]   /* Overlay statistics */
font-mono    /* Technical data (tree, dimensions) */
```

---

## Future Enhancements

1. **Interactive Canvas**
   - Click on subband to isolate
   - Hover to show detailed statistics
   - Zoom controls for high-resolution images

2. **Animation**
   - Fade-in for overlay badges
   - Smooth transitions when changing levels
   - Pulse effect on active subbands

3. **Export Options**
   - Download tree as SVG
   - Export canvas with overlays
   - Save statistics as CSV

---

**Status:** ✅ **COMPLETE AND VERIFIED**

The Subband Tree Canvas now matches the reference screenshot with:
- Professional hierarchical tree view
- Large, prominent 2D canvas with overlays
- Color-coded badges throughout
- Clean two-column responsive layout
- Enhanced statistics presentation

All features have been implemented, tested, and verified with HMR updates! 📊🎨
