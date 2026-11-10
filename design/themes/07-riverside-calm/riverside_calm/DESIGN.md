---
name: Riverside Calm
colors:
  surface: '#f3faff'
  surface-dim: '#cadde6'
  surface-bright: '#f3faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#e5f6ff'
  surface-container: '#def1fa'
  surface-container-high: '#d8ebf4'
  surface-container-highest: '#d3e5ef'
  on-surface: '#0c1e24'
  on-surface-variant: '#3f4849'
  inverse-surface: '#22333a'
  inverse-on-surface: '#e1f4fd'
  outline: '#6f7979'
  outline-variant: '#bfc8c9'
  surface-tint: '#26676b'
  primary: '#0d575a'
  on-primary: '#ffffff'
  primary-container: '#2f6f73'
  on-primary-container: '#b0f0f4'
  inverse-primary: '#93d1d5'
  secondary: '#3b6663'
  on-secondary: '#ffffff'
  secondary-container: '#bbe8e4'
  on-secondary-container: '#3f6a67'
  tertiary: '#524d43'
  on-tertiary: '#ffffff'
  tertiary-container: '#6b655a'
  on-tertiary-container: '#ece3d5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#aeeef2'
  primary-fixed-dim: '#93d1d5'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f53'
  secondary-fixed: '#beebe7'
  secondary-fixed-dim: '#a2cfcb'
  on-secondary-fixed: '#00201e'
  on-secondary-fixed-variant: '#224e4b'
  tertiary-fixed: '#eae1d3'
  tertiary-fixed-dim: '#cec5b8'
  on-tertiary-fixed: '#1f1b13'
  on-tertiary-fixed-variant: '#4b463c'
  background: '#f3faff'
  on-background: '#0c1e24'
  surface-variant: '#d3e5ef'
typography:
  display-lg:
    fontFamily: Noto Serif
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.01em
  display-lg-mobile:
    fontFamily: Noto Serif
    fontSize: 34px
    fontWeight: '600'
    lineHeight: 42px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Noto Serif
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Noto Serif
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
  headline-md:
    fontFamily: Noto Serif
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  headline-sm:
    fontFamily: Noto Serif
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  title-md:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  title-sm:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Noto Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  numeric-table:
    fontFamily: Noto Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies the serene cadence of northern Thai riparian life at Rim Ping Riverside in Pa Sang, Lamphun. Conceived for hospitality operations and guest-facing digital touchpoints, it translates the slow drift of the Ping River, woven bamboo rafts, and dappled afternoon shade into a tranquil, spa-grade interface.

The design movement combines **organic minimalism** with **tactile atmospheric layering**:
- **Tranquil Fluidity:** Soft aquatic transitions, undulating wave contour dividers, and spacious breathing room prevent operational fatigue while instilling an immediate sense of retreat.
- **Natural Tactility:** Architectural warmth is drawn from river sand and river-smoothed stones, balancing high-density channel manager inventories with artisanal warmth.
- **Operational Rigor:** Despite its restorative atmosphere, the system enforces unambiguous readability, meticulous data grids, and high-legibility typographic hierarchies required for multi-channel inventory synchronization, rates, and occupancy management.

## Colors

The palette mirrors water currents, riparian silt, and Northern Thai skies, ensuring WCAG AAA legibility across administrative and guest journeys.

- **Primary (`#2F6F73` - River Teal):** Anchors high-priority actions, primary brand signifiers, selected navigational nodes, and active reservation flags.
- **Secondary (`#A8D5D1` - Soft Aqua):** Functions as a luminous accent for interactive selections, hover washes, gentle badge fills, and water-reflection glows.
- **Tertiary / Base Neutral (`#EFE6D8` - River Sand):** An earthy, warm neutral providing grounding contrast against cool aquatic tones; deployed on structural sidebars, timeline tracks, and segmented tab tracks.
- **Surface Canvas (`#FCFCFA` - River White):** An off-white, mineral-tinted field avoiding stark clinical glare.
- **Surface Containers (`#F2F8F8` - River Mist, `#EBF4F4` - Shallow Shallows):** Tiered background tints for nested cards, data tables, channel rate matrices, and grouped modal blocks.
- **On-Surface / Text (`#23343B` - Deep Blue-Grey):** A rich slate-river stone charcoal that guarantees high-contrast legibility without the harshness of pure black.
- **System Accents:**
  - Success / Confirmed: `#357258` (Forest Canopy)
  - Warning / Rate Discrepancy: `#B87A38` (Amber Teak)
  - Critical / Overbooking: `#A84742` (Clay Brick)

## Typography

The typographic hierarchy pairs the literary elegance of serif headlines with the objective clarity of clean sans-serif text. In production implementations with Thai language support, Pridi serves as the primary heading typeface, with Noto Sans Thai handling body and UI data. For universal web tokenization, Noto Serif and Noto Sans provide unified bi-lingual metric consistency.

- **Headlines (Noto Serif / Pridi):** Conveys quiet boutique hospitality. Used for room types, dashboard greetings, macro metrics, and invoice statements.
- **Body & Data (Noto Sans / Noto Sans Thai):** Delivers clean readability inside multi-channel matrices, inventory grids, availability calendars, and booking detail drawers.
- **Numbers & Rates:** Financial and room allotment tables must utilize tabular figures (`font-variant-numeric: tabular-nums`) to preserve optical column alignment across high-density inventory views.

## Layout & Spacing

The layout is constructed on an adaptable 12-column grid designed for data-intensive channel management alongside spacious editorial modules.

- **Responsive Adaptations:**
  - **Desktop (1200px+):** Fixed 280px navigation rail on `#EFE6D8` / `#F2F8F8` surfaces. 12-column content field with `gutter` (1.5rem) and `margin` (2rem). Channel distribution tables expand horizontally with sticky room category headers.
  - **Tablet (768px – 1199px):** Rail collapses to an icon bar or slide-over drawer. 8-column layout with 1.25rem gutters. Dual-pane detail panes convert to push-in sheets.
  - **Mobile (<768px):** Single-column stack with `margin-mobile` (1rem) and `gutter-mobile` (0.75rem). Fixed bottom action sheets for rate updates and fast reservation status changes.
- **Rhythm:** Spacing follows an 8-point base grid. Channel matrix cells use strict 40px minimum tap heights, while informational hotel presentation areas leverage `space-xl` to invoke unhurried calm.

## Elevation & Depth

Visual hierarchy uses tonal river depth and ambient aquatic shadows rather than high-contrast structural borders:

- **Tiered Tonal Surfaces:**
  - Level 0 (Base Canvas): `#FCFCFA`
  - Level 1 (Resting Cards, Table Containers): `#F2F8F8`
  - Level 2 (Nested Panels, Filter Bars): `#EBF4F4`
  - Level 3 (Active Focus, Floating Drawers): `#FFFFFF`
- **Soft River Shadows:** Shadows incorporate river teal hues rather than raw black:
  - Floating Panels: `0px 8px 24px -4px rgba(35, 52, 59, 0.06), 0px 4px 8px -2px rgba(47, 111, 115, 0.04)`
  - Elevated Popovers & Menus: `0px 16px 36px -6px rgba(35, 52, 59, 0.10), 0px 6px 12px -3px rgba(47, 111, 115, 0.06)`
- **Water Reflection Accents:** Bottom borders of headers and persistent toolbars feature a subtle gradient wash fading from `rgba(168, 213, 209, 0.4)` to transparent.
- **Wave Dividers:** Section breaks for public-facing guest folios and dashboard category delimiters employ gentle SVG sine wave dividers running at `height: 24px` with a fill of `#EBF4F4` or `#EFE6D8`.

## Shapes

The shape system evokes smooth river pebbles and water currents through generous, organic radiuses:

- **Surfaces and Enclosures (Cards, Modals, Drawers):** Built with `16px` (`rounded-xl` / 1rem equivalent in token scale `2`) to echo water-smoothed forms.
- **Interactive Buttons:** Set to `12px` border radius, creating a comfortable, touch-friendly pill-soft form without turning into full capsules.
- **Badges, Status Tags, and Chips:** Full pill radius (`9999px`) for seamless visual skimming.
- **Table Cells and Calendar Grids:** Micro-radiused corners (`6px`) for individual allotment cells to maintain structural grid discipline.

## Components

### Buttons
- **Primary:** Solid River Teal (`#2F6F73`) background, `#FCFCFA` text, `12px` border radius, `0 2px 6px rgba(47, 111, 115, 0.20)` shadow. Active state shifts to `#24585B`.
- **Secondary:** Surface tint `#EBF4F4`, River Teal text (`#2F6F73`), subtle `1px` border of `#A8D5D1`.
- **Tertiary / Ghost:** Transparent background, `#23343B` text, hover initiates a soft wash of `#F2F8F8`.

### Channel Manager Data Grid & Tables
- **Header:** Sticky `#EFE6D8` (Sand) background, `#23343B` 600-weight typography with lowercase uppercase tracking.
- **Rows:** Alternating rows using `#FCFCFA` and `#F2F8F8`. Hover state applies `#A8D5D1` at 20% opacity.
- **Availability Cells:** Numeric indicators center-aligned. Closed / stop-sell days flagged with a muted sand diagonal stroke pattern. Direct OTA channel tags (Booking.com, Agoda, Airbnb) displayed within rounded 4px indicators.

### Cards & Panels
- **Structure:** Background `#FCFCFA`, border `1px solid #EBF4F4`, corner radius `16px`. Internal padding set to `1.5rem` (`space-lg`).
- **Accent Ribbon:** Left edge micro-accent (3px) using River Teal (`#2F6F73`) to indicate active room occupancy or VIP reservation status.

### Form Inputs & Date Pickers
- **Field Canvas:** `#FFFFFF` fill with `1px solid #A8D5D1`. Corner radius `8px`.
- **Focus State:** 2px ring in River Teal (`#2F6F73`) at 40% alpha, zero default outline.
- **Range Pickers (Check-in / Check-out):** Range fill uses Soft Aqua (`#A8D5D1`) at 35% opacity; start and end nodes are solid River Teal circles with `#FCFCFA` typography.

### Chips & Status Indicators
- **Inventory Confirmed:** `#EBF4F4` background with `#2F6F73` label and a 6px circular indicator dot.
- **Pending / Syncing:** `#EFE6D8` background with `#B87A38` label.
- **Channel Sync Warning:** Red silt tint background (`rgba(168, 71, 66, 0.12)`), `#A84742` text.

### Selection Controls
- **Checkboxes & Radios:** `20px` touch targets. Unchecked: `1.5px solid #A8D5D1`, `#FFFFFF` base. Checked: River Teal `#2F6F73` fill with white checkmark/dot.