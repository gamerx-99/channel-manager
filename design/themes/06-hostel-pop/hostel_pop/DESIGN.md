---
name: Hostel Pop
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1b1b1b'
  on-surface-variant: '#4d4634'
  inverse-surface: '#303030'
  inverse-on-surface: '#f1f1f1'
  outline: '#7f7661'
  outline-variant: '#d1c5ad'
  surface-tint: '#745c00'
  primary: '#745c00'
  on-primary: '#ffffff'
  primary-container: '#ffd23f'
  on-primary-container: '#725a00'
  inverse-primary: '#edc22e'
  secondary: '#b32057'
  on-secondary: '#ffffff'
  secondary-container: '#fd5c8e'
  on-secondary-container: '#62002a'
  tertiary: '#006b57'
  on-tertiary: '#ffffff'
  tertiary-container: '#62edc9'
  on-tertiary-container: '#006955'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffe089'
  primary-fixed-dim: '#edc22e'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#ffd9e0'
  secondary-fixed-dim: '#ffb1c2'
  on-secondary-fixed: '#3f0018'
  on-secondary-fixed-variant: '#8f0040'
  tertiary-fixed: '#6ffad5'
  tertiary-fixed-dim: '#4eddba'
  on-tertiary-fixed: '#002019'
  on-tertiary-fixed-variant: '#005141'
  background: '#f9f9f9'
  on-background: '#1b1b1b'
  surface-variant: '#e2e2e2'
typography:
  display-hero:
    fontFamily: Epilogue
    fontSize: 64px
    fontWeight: '900'
    lineHeight: 72px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Epilogue
    fontSize: 40px
    fontWeight: '900'
    lineHeight: 46px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Epilogue
    fontSize: 44px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Epilogue
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Epilogue
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Epilogue
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Epilogue
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 28px
  body-md:
    fontFamily: Epilogue
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-sm:
    fontFamily: Epilogue
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-sticker:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels an unapologetically energetic Neo-Brutalist aesthetic tailored for vibrant hospitality, social travel, and youth culture. Drawing inspiration from 90s zine culture, street stickers across Southeast Asia, and raw modern web brutalism, the visual tone is playful, magnetic, and tactile. 

The interface communicates immediacy, warmth, and spontaneous adventure. Every visual cue trades corporate sterility for physical, tangible presence: heavy ink-line geometry, hyper-saturated solar tones, sticker-like overlays, and mechanical tactile feedback. Interfaces feel stamped, pinned, and alive—inviting exploration without friction.

## Colors

The palette is engineered around high visual impact and uncompromising contrast, anchored by pure pitch `#000000` outlines and text against stark `#FFFFFF` base planes. 

### Color Roles & Semantics
- **Primary (Electric Yellow - `#FFD23F`):** The primary spotlight tone. Used for main action containers, hero accents, highlight tags, and dominant surface fills that demand immediate orientation.
- **Secondary (Hot Pink - `#FF5D8F`):** High-energy punch. Reserved for urgent CTAs, celebratory badges, booking prompts, party announcements, and interactive toggle states.
- **Accent (Sky Cyan - `#3BCEAC`):** Refreshing balance. Applied to utilities, availability pills, success indicators, amenities tags, and complementary sticker elements.
- **Surface & Backgrounds (`#FFFFFF`):** High-clarity canvas base allowing stark black borders and hyper-bright fills to pop without visual mud.
- **Neutral / Structural Line (`#000000`):** The absolute structural framework. Pure black renders all text, input boundaries, icons, and persistent 3px perimeter strokes.

Contrast ratios between all surface tones and black text exceed 9:1, surpassing WCAG AAA standards for legibility in outdoor and mobile contexts.

## Typography

Typography embodies high impact and structured editorial punch. Epilogue provides an assertive geometric presence with tight tracking and hefty weights (800/900) for headlines, while Space Grotesk offers crisp technical cadence for uppercase badges, functional tags, and pricing chips.

### Typography Rules
- **All-Caps Expressiveness:** Top-tier badges, interactive buttons, sticker labels, and categorical tags render strictly in uppercase with wide letter-spacing (`0.05em` to `0.1em`).
- **Headlines:** Use dense line heights (1.1x to 1.2x) to create visual poster blocks. Headlines pair directly over bright solid backgrounds or white panels with thick bottom-border dividers.
- **Multilingual Accommodation:** For Thai localization instances where native scripts are consumed, line heights must dynamically expand by +20% to avoid vertical clipping of tonal marks and ascenders.

## Layout & Spacing

The layout model utilizes a responsive fluid grid bounded inside disciplined max-width containers (1200px desktop maximum). Surfaces lean into structured blockiness rather than endless floating whitespace.

### Grid Architecture
- **Desktop (1024px+):** 12-column layout with 24px (`1.5rem`) gutters and 32px (`2rem`) outer canvas margins. Components align tightly to horizontal structural rules.
- **Tablet (768px - 1023px):** 8-column layout with 20px gutters and 24px margins. Two-column card lists dominate.
- **Mobile (< 768px):** 4-column layout with 16px (`1rem`) gutters and 16px margins. Complex horizontal arrays stack into solid modular cards with no internal float.

Spacing tokens are strict mathematical steps based on an 8px root grid (`0.5rem`). Layout components pack content tightly, prioritizing visual density and physical rhythm.

## Elevation & Depth

This system discards blur-based shadows, soft light falloffs, and pseudo-skeuomorphic diffusion. Depth is communicated strictly through **hard structural offsets and crisp 3px ink strokes**.

### Elevation Rules
- **Structural Stroke:** Every elevated card, modal, button, and badge features a uniform `3px solid #000000` border.
- **Desktop Depth (Elevated Tier 1):** `box-shadow: 6px 6px 0px #000000;` applied to primary cards, sticky action strips, and hero containers.
- **Desktop Depth (Elevated Tier 2 - Badges & Small Items):** `box-shadow: 4px 4px 0px #000000;`.
- **Mobile Adjustment:** Reduce desktop shadows to `box-shadow: 4px 4px 0px #000000` for Tier 1 and `3px 3px 0px #000000` for Tier 2 to respect compact screen real estate.
- **Interactive State Mechanics:**
  - *Rest:* Element sits with full offset shadow (`6px 6px 0px #000000`).
  - *Hover:* Slight mechanical shift down and right (`transform: translate(2px, 2px); box-shadow: 4px 4px 0px #000000;`).
  - *Active / Pressed:* Complete tactile collapse (`transform: translate(6px, 6px); box-shadow: 0px 0px 0px #000000;`).

## Shapes

The design system embraces a **Soft/Brutalist Corner** approach (`roundedness: 1`), utilizing a subtle `4px` (`0.25rem`) border-radius on structural blocks. This prevents borders from appearing overly digitized or sharp-edged, lending a die-cut paper or vinyl sticker texture to every element.

### Shape Details
- **Base Elements (Cards, Panels, Inputs):** 4px border-radius.
- **Interactive Pills & Badges:** Full circular pill shapes (`9999px`) are reserved exclusively for circular category tags, floating discount stamps, and status dots to contrast against modular block architecture.
- **Rotated Stickers:** Expressive sticker badges employ deliberate hardware transforms: `transform: rotate(-2deg)` or `transform: rotate(3deg)` to simulate physical adhesive layers slapped on top of content frames.

## Components

### Buttons
- **Primary Action:** Background `#FFD23F`, 3px solid `#000000` border, `6px 6px 0px #000000` shadow. Text in Space Grotesk bold uppercase with tracking.
- **Secondary Action:** Background `#FF5D8F`, identical borders and shadow mechanics.
- **Ghost/Tertiary:** Background `#FFFFFF`, 3px solid black border, black text.
- **Hover/Active Mechanics:** Must implement translation transforms down-right matching shadow depletion. Zero bezier easing; use linear or rapid step curves (`100ms ease-out`).

### Badges & Sticker Chips
- **Playful Rotation:** Display items (e.g., "POPULAR DORM", "FREE BREAKFAST") sit at alternating tilts (`-2deg` to `3deg`).
- **Borders & Colors:** Inverted color schemes (e.g., `#3BCEAC` fill with 3px black stroke, `3px 3px 0px #000000` offset shadow).
- **Placement:** Positioned half-overlapping the top or right border of parent cards to emulate physical tape or stickers.

### Cards
- **Base Container:** `#FFFFFF` background, `3px solid #000000` perimeter border, `6px 6px 0px #000000` hard shadow.
- **Card Headers:** Often separated by a horizontal `3px solid #000000` divider line with a solid background fill (`#FFD23F` or `#3BCEAC`) across the header slice.
- **Images inside Cards:** Bordered by a `3px solid #000000` bottom stroke, never borderless or full-bleed within the card without outline separation.

### Inputs & Form Controls
- **Text Fields:** `#FFFFFF` background, `3px solid #000000` stroke, 4px border-radius, hard `4px 4px 0px #000000` shadow. Text is solid black.
- **Focus State:** Background shifts to `#FFFFFF`, shadow snaps to `#FFD23F` outline or expands to `6px 6px 0px #000000` without changing line weights.
- **Checkboxes & Radios:** Handled via thick 3px black outlines with a solid `#000000` or `#FF5D8F` square fill when checked. No soft ticks.

### Lists & Activity Feeds
- **Borders:** Separated by discrete `3px solid #000000` bottom rules.
- **Hover Effects:** Alternating rows light up in pastel highlights (`#FFD23F` or `#3BCEAC` at 30% tint or pure yellow accent).