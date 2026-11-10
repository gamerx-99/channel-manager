---
name: Mountain Mist
colors:
  surface: '#f5fbf8'
  surface-dim: '#d5dbd8'
  surface-bright: '#f5fbf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff5f2'
  surface-container: '#e9efec'
  surface-container-high: '#e4e9e6'
  surface-container-highest: '#dee4e1'
  on-surface: '#171d1b'
  on-surface-variant: '#424844'
  inverse-surface: '#2b3230'
  inverse-on-surface: '#ecf2ef'
  outline: '#727973'
  outline-variant: '#c2c8c2'
  surface-tint: '#486555'
  primary: '#082519'
  on-primary: '#ffffff'
  primary-container: '#1f3b2d'
  on-primary-container: '#87a593'
  inverse-primary: '#aeceba'
  secondary: '#4a6545'
  on-secondary: '#ffffff'
  secondary-container: '#c6e6bd'
  on-secondary-container: '#4c6847'
  tertiary: '#311c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#4e2f00'
  on-tertiary-container: '#cd9349'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#caead6'
  primary-fixed-dim: '#aeceba'
  on-primary-fixed: '#032014'
  on-primary-fixed-variant: '#304d3e'
  secondary-fixed: '#cbebc2'
  secondary-fixed-dim: '#b0cfa7'
  on-secondary-fixed: '#072107'
  on-secondary-fixed-variant: '#334d2f'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#fabb6c'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f5fbf8'
  on-background: '#171d1b'
  surface-variant: '#dee4e1'
typography:
  headline-xl:
    fontFamily: Epilogue
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Epilogue
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Epilogue
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Epilogue
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: 0em
  headline-md:
    fontFamily: Epilogue
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Epilogue
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Noto Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 3rem
  margin-sm: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system evokes the tranquil, immersive experience of dawn breaking over northern Thai highlands—cool morning fog drifting through pine-crested ridges, ambient mountain rain, and the serene warmth of first light. Designed for an eco-luxury retreat in Pang Mapha, Mae Hong Son, the aesthetic prioritizes cinematic nature immersion, stillness, and organic balance.

The visual style blends modern organic minimalism with atmospheric glassmorphism. Surfaces emulate morning mist through semi-translucent backdrops and vaporous gradients, counterbalanced by grounded evergreen structures and delicate amber highlights reminiscent of morning sunlight piercing through pine canopies.

## Colors

The palette directly references high-altitude montane forest microclimates:
- **Primary (`#1F3B2D` - Forest Green):** Anchors high-priority structural elements, deep headings, and key typography, evoking dense pine canopies.
- **Secondary (`#4F6B4A` - Moss):** Serves as supporting organic framing, accents, foliage tags, and secondary interactives.
- **Tertiary (`#E0A458` - Sunrise Amber):** Applied sparingly to focal interaction targets, primary booking CTAs, and morning ambient badges. Paired intentionally with dark forest green (`#1F3B2D`) text to retain contrast without visual harshness.
- **Neutral Surface Tone (`#DDE3E0` - Mist Grey):** Provides muted borders, soft divider rules, and low-contrast surface card fills.
- **Canvas Base (`#F3F5F4` - Fog White):** Acts as the foundational ground plane, breathing room, and soft light reflection.

### Color Hierarchy & Gradients
- Soft atmospheric gradients (`linear-gradient(180deg, rgba(243, 245, 244, 0) 0%, rgba(243, 245, 244, 0.95) 100%)`) must be layered over hero landscape photography to bleed imagery seamlessly into fog-white sections.
- Surface fills across containers leverage translucent opacities: `rgba(255, 255, 255, 0.70)` or `rgba(243, 245, 244, 0.80)`.

## Typography

The typographical pairing provides clear structure and seamless bilingual execution between English and Thai scripts:
- **Headings (Epilogue):** Set in SemiBold weight with slightly tucked negative letter spacing for larger levels. Its structured geometry brings a refined editorial gravity that matches mountain contours. In regional Thai rendering, use **Prompt SemiBold** for native script support.
- **Body & Labels (Noto Sans):** Prioritizes legibility, breathability, and optical clarity across descriptions, itinerary details, and booking metadata. In regional Thai rendering, use **Noto Sans Thai Regular**.
- Maintain generous line-heights across all narrative prose to sustain the slow, unhurried brand cadence.

## Layout & Spacing

The layout embraces expansive negative space, reflecting vast panoramic mountain views:
- **Grid Architecture:** 12-column fluid grid on desktop (max width 1280px, 48px canvas margin, 24px column gutters). On mobile devices, reflow to a 4-column layout with 20px canvas margins and 16px gutters.
- **Vertical Rhythm:** Sections are punctuated with deep vertical gaps (80px to 120px on desktop, 48px to 64px on mobile) to let visual elements float naturally like morning clouds.
- **Bleed Layouts:** Panoramic photography and weather status bars may break containment to extend edge-to-edge, overlaid with glassmorphic cards anchored along the lower third.

## Elevation & Depth

Visual depth is achieved through translucent moisture layering rather than heavy synthetic shadows:
- **Mist Glassmorphism (Level 1):** `backdrop-filter: blur(16px)` with surface fill `rgba(255, 255, 255, 0.72)` and a hairline border `1px solid rgba(221, 227, 224, 0.6)`. Shadows are virtually imperceptible: `0 4px 24px -2px rgba(31, 59, 45, 0.04)`.
- **Floating Overlays & Dialogs (Level 2):** `backdrop-filter: blur(24px)` with surface fill `rgba(243, 245, 244, 0.88)` bounded by `1px solid rgba(255, 255, 255, 0.9)`. Ambient shadow: `0 12px 36px -4px rgba(31, 59, 45, 0.08)`.
- **Photo Overlays:** Use layered atmospheric mist gradients to fade photographic edges into the page background, eliminating hard cut lines between nature media and text surfaces.

## Shapes

The geometry mirrors smoothed river stones and natural land contours:
- **Buttons & Chips:** True pill geometry (`border-radius: 9999px`) provides tactile softness for all touch targets.
- **Cards & Panes:** Generous rounded boundaries (20px to 24px / `rounded-2xl` to `rounded-3xl`) soften content containers and structural boundaries.
- **Media Containers:** Landscape imagery frames use matching 20px or 24px radiuses when contained, or zero-radius when spanning edge-to-edge with mist masks.

## Components

### Buttons
- **Primary Action (Sunrise Amber):** Fully rounded pill (`border-radius: 9999px`), background `#E0A458`, label text `#1F3B2D` in bold weight. Hover state introduces a gentle warm glow (`0 4px 16px rgba(224, 164, 88, 0.35)`) and slight brightness shift.
- **Secondary Action (Forest Mist):** Pill shape with transparent or mist-white fill (`rgba(255, 255, 255, 0.5)`), border `1.5px solid #4F6B4A`, and text `#1F3B2D`.
- **Tertiary / Text Action:** Text-only in `#1F3B2D` with an amber accent dot indicator or inline chevron.

### Cards
- Constructed with frosted glass panels (`backdrop-blur-md`, `bg-white/70` or `bg-fog/80`), 20px border radius, and a delicate `#DDE3E0` border.
- Used for villa preview cards, weather forecasts (sea of clouds index, humidity, temperature), and curated trekking activities.

### Chips & Badges
- Compact pill-shaped metadata tags (e.g., "Sea of Clouds 95%", "Rainforest View", "Organic Dining").
- Style with `rgba(79, 107, 74, 0.12)` background, `#1F3B2D` text, and zero borders.

### Input Fields & Selectors
- Date pickers and guest selectors feature pill or 16px soft-corner outlines in `#DDE3E0`, transitioning to a solid `#4F6B4A` border on focus without harsh outlines.
- Backgrounds remain calm mist grey (`rgba(243, 245, 244, 0.6)`).

### Checkboxes & Radios
- Forest green `#1F3B2D` active states with crisp white check indicators. Unchecked states use a subtle `#DDE3E0` ring against a frosted white base.

### Specialized Resort Widgets
- **Cloud & Fog Forecast Bar:** A horizontal ambient widget showcasing morning cloud density predictions, altitude mist indicators, and sunrise times using micro-chips and soft amber sunrise highlights.