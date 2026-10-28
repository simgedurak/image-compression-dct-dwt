# Manuel ROI Mode - Complete Implementation

## Summary

Successfully implemented all requested features for the "Manuel ROI" mode in the Semantic ROI Lab:

1. ✅ **Interactive Bounding Box Selection** - Visual feedback and dashed borders
2. ✅ **Smart Action Button** - Context-aware text based on mode and selection state
3. ✅ **Baseline Auto-Calibration Transparency** - Display calibrated δ value

---

## Feature 1: Interactive Bounding Box Selection

### Visual Enhancements

**File:** `frontend/src/components/tabs/SemanticRoiLab.jsx` (RoiCanvas component)

#### Active State (Manuel Mode)
- **Dashed green border** (`border-emerald-400 border-dashed`) signals interactive region
- **Light green background** (`bg-emerald-50/30`) indicates clickable area
- **Instructional overlay** appears when no box is selected:
  ```
  "✎ Bir kutu çizmek için tıklayın ve sürükleyin"
  (Click and drag to draw a box)
  ```

#### Selected Box Rendering
- **Dashed green rectangle** with semi-transparent fill
- **Enhanced shadow** (`shadow-lg`) for depth
- **Live preview** while dragging
- **Persistent display** after release

#### Disabled State (Otomatik Mode)
- **Gray border** and reduced opacity
- **Not-allowed cursor** prevents interaction
- Automatically disabled when "Otomatik (YOLO)" is selected

### Clear Selection Feature
Added a "Temizle" (Clear) button that appears when:
- Manuel mode is active
- A box has been drawn

Allows users to easily reset their selection without switching modes.

---

## Feature 2: Smart Action Button

### Dynamic Button Text

**Context-aware labels based on state:**

| Mode | Box Selected | Button Text |
|------|--------------|-------------|
| Otomatik | N/A | "1 nesne tespit edildi" |
| Manuel | ✓ Yes | "Seçili ROI ile Çalıştır" |
| Manuel | ✗ No | "Manuel ROI Seçin" |

### Validation Logic

**File:** `frontend/src/components/tabs/SemanticRoiLab.jsx` (run function)

```javascript
async function run() {
  if (!file) {
    setError('Upload an image in the sidebar first.')
    return
  }
  
  // Validate manual mode has a box selected
  if (!autoFace && !box) {
    setError('Lütfen görsel üzerinde bir alan seçin (Please select a region on the image)')
    return
  }
  
  // ... proceed with API call
}
```

**Error Message Display:**
- Friendly bilingual message: Turkish + English
- Appears in ErrorBanner component
- User-friendly guidance instead of technical error

### Payload Structure

**Coordinates sent to backend:**
```javascript
const roiCoords = !autoFace && box 
  ? [[box.x, box.y, box.w, box.h]]  // Manual box
  : undefined                         // Auto-detection
```

**Backend receives:**
- `roi_coords`: `[[x, y, w, h]]` array when manual
- `undefined` when automatic (triggers face detection)

---

## Feature 3: Baseline Auto-Calibration Transparency

### Display Location

**File:** `frontend/src/components/tabs/SemanticRoiLab.jsx` (Bit Budget section)

Added below the BPP comparison grid:

```jsx
<div className="mt-3 border-t border-slate-200 pt-3">
  <p className="text-center text-[10px] text-slate-500">
    Baseline Calibrated Step: 
    <span className="font-mono font-semibold text-slate-700">
      δ = {result.baseline.delta ? result.baseline.delta.toFixed(2) : 'Auto'}
    </span>
    <span className="ml-1 text-slate-400">
      (auto-matched to semantic bpp)
    </span>
  </p>
</div>
```

### Visual Example

```
┌─────────────────────────────────────────────┐
│         AYNI BİT BÜTÇESİ                   │
│                                             │
│  Baseline    Semantic        Fark          │
│  2.556 bpp   2.556 bpp   +0.000 bpp       │
│                                             │
│  ─────────────────────────────────────────  │
│  Baseline Calibrated Step: δ = 39.87      │
│  (auto-matched to semantic bpp)            │
└─────────────────────────────────────────────┘
```

### Why This Matters

**Educational transparency:**
- Users understand why baseline BPP ≈ semantic BPP
- Shows the binary search found δ=39.87 (vs user's δ_bg=40.0)
- Explains the "equal bit budget" constraint
- Builds trust in the scientific validity of results

---

## User Experience Flow

### Automatic Mode (Default)
1. User uploads image
2. Toggles "Otomatik (YOLO)"
3. Button shows "1 nesne tespit edildi" (or actual count from backend)
4. Click to run face detection + semantic compression
5. Results show with calibrated baseline delta

### Manual Mode
1. User uploads image
2. Toggles "Manuel ROI"
3. Canvas displays dashed green border + instruction overlay
4. User clicks and drags to draw rectangle
5. Selected box appears with dashed outline
6. Button changes to "Seçili ROI ile Çalıştır"
7. Optional: Click "Temizle" to reset selection
8. Click run button to process with custom ROI
9. Results show with calibrated baseline delta

### Error States

**No image uploaded:**
```
Error: Upload an image in the sidebar first.
```

**Manual mode without selection:**
```
Error: Lütfen görsel üzerinde bir alan seçin 
       (Please select a region on the image)
```

---

## Technical Implementation Details

### Coordinate System

**Display coordinates** (canvas pixels) → **Natural coordinates** (image pixels)

```javascript
const scaleX = naturalWidth / containerSize.w
const scaleY = naturalHeight / containerSize.h

const naturalBox = {
  x: Math.round(displayX * scaleX),
  y: Math.round(displayY * scaleY),
  w: Math.round(displayW * scaleX),
  h: Math.round(displayH * scaleY)
}
```

Ensures accurate ROI regardless of display size.

### Minimum Box Size

```javascript
if (w < 6 || h < 6 || !containerSize.w) return
```

Prevents accidental single-click selections (requires ≥6px drag).

### State Management

```javascript
const [autoFace, setAutoFace] = useState(true)  // Mode toggle
const [box, setBox] = useState(null)            // Selected box
const [drag, setDrag] = useState(null)          // Active drag state
```

Clear separation of concerns for each interaction state.

---

## Visual Design Choices

### Color Semantics

| Color | Use | Meaning |
|-------|-----|---------|
| Emerald-400 | Active border | Interactive, ready to draw |
| Emerald-50/30 | Background tint | Subtle hint of interactivity |
| Emerald-500 | Selected box | Confirmed selection |
| Emerald-400/20 | Box fill | Semi-transparent overlay |
| Slate-200 | Disabled border | Not interactive |

### Typography Hierarchy

```css
text-[10px]     /* Helper text, labels */
text-xs         /* Instruction overlay */
font-mono       /* Numeric values (δ) */
font-semibold   /* Emphasized values */
text-slate-400  /* Explanatory text */
text-slate-700  /* Primary values */
```

---

## API Integration

### Request Payload

**Automatic mode:**
```json
{
  "file": <binary>,
  "delta_roi": 5.0,
  "delta_bg": 40.0,
  "wavelet": "db4",
  "level": 3
  // roi_coords: undefined → backend auto-detects faces
}
```

**Manual mode:**
```json
{
  "file": <binary>,
  "roi_coords": [[120, 80, 200, 250]],  // x, y, w, h
  "delta_roi": 5.0,
  "delta_bg": 40.0,
  "wavelet": "db4",
  "level": 3
}
```

### Response Structure

```json
{
  "baseline": {
    "bpp": 2.5616,
    "delta": 39.87,  ← Now displayed in UI
    "psnr": 23.83,
    "reconstructed_png": "base64..."
  },
  "semantic": {
    "bpp": 2.5558,
    "psnr": 23.79,
    "reconstructed_png": "base64..."
  },
  "summary": {
    "delta_bpp": -0.0058
  }
}
```

---

## Accessibility Improvements

1. **Visual Affordances**
   - Dashed border signals "draw here"
   - Cursor changes (crosshair vs not-allowed)
   - Instructional overlay for first-time users

2. **State Feedback**
   - Button text reflects current state
   - Error messages provide actionable guidance
   - Clear button allows easy reset

3. **Scientific Transparency**
   - Calibrated delta exposed
   - Explanation text "(auto-matched to semantic bpp)"
   - Builds user understanding of DSP theory

---

## Testing Checklist

### Manual Mode ✅
- [x] Dashed green border appears when active
- [x] Instruction overlay shows when no box selected
- [x] Click and drag creates visible rectangle
- [x] Live preview updates while dragging
- [x] Rectangle persists after mouse release
- [x] Button text: "Seçili ROI ile Çalıştır"
- [x] "Temizle" button appears and works
- [x] Validation error if running without selection

### Automatic Mode ✅
- [x] Canvas disabled (gray, not-allowed cursor)
- [x] Button text: "1 nesne tespit edildi"
- [x] Face detection runs on backend
- [x] No validation error

### Calibrated Delta Display ✅
- [x] Shows in bit budget section
- [x] Format: "δ = 39.87"
- [x] Explanation text present
- [x] Updates with each run

---

## Files Modified

1. **`frontend/src/components/tabs/SemanticRoiLab.jsx`**
   - Enhanced RoiCanvas visual feedback (lines 72-106)
   - Added validation in run() (lines 185-194)
   - Dynamic button text (lines 293, 465)
   - Calibrated delta display (lines 310-318)
   - Clear button (lines 422-442)

---

## Before vs After

### Before
- ❌ Manual mode had no visual indication
- ❌ Button text always "1 nesne tespit edildi"
- ❌ No validation for empty selection
- ❌ Calibrated delta hidden from user

### After
- ✅ Dashed border + instruction overlay
- ✅ Context-aware button text (3 states)
- ✅ Friendly validation error message
- ✅ Transparent calibrated delta display
- ✅ Clear button for easy reset

---

## Example Screenshots (Conceptual)

### Automatic Mode
```
┌─────────────────────────────┐
│ Mode: ● Otomatik  ○ Manuel │
│                             │
│ [Image with gray border]    │
│ Yüz tespiti otomatik       │
│                             │
│ [1 nesne tespit edildi]    │
└─────────────────────────────┘
```

### Manual Mode (Empty)
```
┌─────────────────────────────┐
│ Mode: ○ Otomatik  ● Manuel │
│                             │
│ ┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊│
│ ┊  ✎ Bir kutu çizmek için ┊│
│ ┊  tıklayın ve sürükleyin  ┊│
│ ┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊│
│ Görüntü üzerinde bir kutu  │
│ çizerek ROI belirleyin.     │
│                             │
│ [Manuel ROI Seçin]         │
└─────────────────────────────┘
```

### Manual Mode (Selected)
```
┌─────────────────────────────┐
│ Mode: ○ Otomatik  ● Manuel │
│                             │
│ ┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊│
│ ┊    ╔════════╗           ┊│
│ ┊    ║████████║ (ROI)     ┊│
│ ┊    ╚════════╝           ┊│
│ ┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊│
│ Görüntü üzerinde... Temizle│
│                             │
│ [Seçili ROI ile Çalıştır]  │
└─────────────────────────────┘
```

---

**Status:** ✅ **ALL FEATURES IMPLEMENTED AND TESTED**

The Manuel ROI mode is now fully functional with:
- Clear visual feedback for interaction
- Smart validation and error messages
- Context-aware UI elements
- Scientific transparency through calibrated delta display

Users can now confidently select custom ROIs and understand the DSP theory behind equal bit budget enforcement! 🎯
