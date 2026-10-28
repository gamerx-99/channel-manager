---
name: Minimal White
colors:
  surface: '#f9f9f7'
  surface-dim: '#dadad8'
  surface-bright: '#f9f9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f2'
  surface-container: '#eeeeec'
  surface-container-high: '#e8e8e6'
  surface-container-highest: '#e2e3e1'
  on-surface: '#1a1c1b'
  on-surface-variant: '#444841'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f1f1ef'
  outline: '#757870'
  outline-variant: '#c5c8be'
  surface-tint: '#54624d'
  primary: '#52604b'
  on-primary: '#ffffff'
  primary-container: '#6a7963'
  on-primary-container: '#f8ffef'
  inverse-primary: '#bccbb2'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#5c5c59'
  on-tertiary: '#ffffff'
  tertiary-container: '#747571'
  on-tertiary-container: '#fefcf7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e7cd'
  primary-fixed-dim: '#bccbb2'
  on-primary-fixed: '#121f0e'
  on-primary-fixed-variant: '#3d4b37'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1b1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e4e2de'
  tertiary-fixed-dim: '#c7c6c2'
  on-tertiary-fixed: '#1b1c19'
  on-tertiary-fixed-variant: '#464744'
  background: '#f9f9f7'
  on-background: '#1a1c1b'
  surface-variant: '#e2e3e1'
typography:
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 56px
    fontWeight: '300'
    lineHeight: 64px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 36px
    fontWeight: '300'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 40px
    fontWeight: '300'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 28px
    fontWeight: '300'
    lineHeight: 36px
    letterSpacing: 0em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 36px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 30px
    letterSpacing: 0em
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-uppercase:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.12em
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
spacing:
  gutter: 1.5rem
  gutter-desktop: 2.5rem
  margin: 1.25rem
  margin-tablet: 2.5rem
  margin-desktop: 4rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.75rem
  space-xl: 3rem
---

## Brand & Style

This design system is tailored for a tranquil boutique hotel experience situated at the intersection of Scandinavian simplicity and Japanese architectural restraint (Japandi). The visual atmosphere prioritizes stillness, spatial purity, and light. 

### Creative Concept & Personality
- **Quiet Modernity:** Intentional absence of visual clutter; every element on screen earns its right to exist.
- **Architectural Honesty:** Unapologetic geometry, flat planes, pure right angles, and delicate linear structures mimicking spatial joinery.
- **Warm Restraint:** An elevated sanctuary from urban stimulation, blending crisp editorial layouts with organic, muted earthen undertones.

### Target Audience & Emotional Impact
Aimed at discerning travelers, design enthusiasts, and remote professionals seeking quiet luxury, thoughtful hospitality, and functional simplicity. The interface evokes visual calm, deliberate pace, and frictionless navigation without synthetic gradients or faux-skeuomorphic ornamentation.

## Colors

The palette embraces a hyper-reduced spectrum anchored by stark light values, deep grounding neutrals, and a single muted botanical hue.

### Palette Architecture
- **Canvas Base (`#FFFFFF`):** Dominates the viewport to establish generous negative space and maximize natural contrast.
- **Secondary Surface (`#F6F6F4`):** Soft, desaturated off-white used for alternate section blocks, room cards, booking sidebars, and tonal backdrops.
- **Deep Neutral (`#1E1E1E`):** Charcoal graphite serving as high-contrast structural text, crisp 1px borders for selected states, and secondary button outlines. Never use pure black (`#000000`).
- **Muted Mid Grey (`#8A8A86`):** Secondary editorial typography, meta specs (e.g., room square meters, check-in policies), and inactive icons.
- **Structural Hairline (`#E2E2DF`):** Subtle neutral boundary line used across grid partitions, horizontal dividers, and quiet table borders.
- **Botanical Sage Accent (`#7C8B74`):** Earthy, serene green reserved strictly for high-priority interactive conversion points (e.g., "Reserve Room", "Check Availability", and active nav state indicators).

### Usage Rules
- Never stack color fills; surfaces shift purely between `#FFFFFF` and `#F6F6F4`.
- Maintain a strict 90/10 spatial balance where white and off-white compose 90% of the viewport, with graphite and sage providing deliberate punctuation.

## Typography

Typography acts as the primary architectural element of the interface. Built upon IBM Plex Sans (with seamless fallback and parity with IBM Plex Sans Thai), the typographic scale establishes clean rhythm, functional legibility, and refined editorial elegance.

### Application Guidelines
- **Headlines & Editorial Titles:** Set in Light (`300`) or Regular (`400`) weight. Generous line heights ensure headings feel breathable rather than aggressive.
- **Labels & Micro-copy:** Always rendered in uppercase with wide tracking (`0.12em`) at `11px` to provide quiet structure for navigation, room metadata, badges, and status lines.
- **Body & Description Text:** Set in `15px` Regular with comfortable line spacing (`24px`) to optimize bilingual readability across Thai and English scripts.

## Layout & Spacing

The layout philosophy mirrors Japandi interior architecture: wide spatial boundaries, uncluttered corridors of whitespace, and strict rectilinear alignment.

### Grid & Breakpoints
- **Mobile (< 768px):** 4-column fluid layout with `1.25rem` outer canvas margin and `1rem` column gutters. Section stacks are vertical, separated by consistent `space-xl` gaps.
- **Tablet (768px - 1024px):** 8-column layout with `2.5rem` margins and `1.5rem` gutters.
- **Desktop (> 1024px):** 12-column rigid grid with a maximum content container of `1360px`, framed by `4rem` outer canvas margins and `2.5rem` gutters. Editorial hero modules and room showcase galleries may break to full viewport width framed only by outer hairlines.

### Spatial Rhythm
- Density is deliberately low. Do not compress elements to save vertical height; empty space represents luxury, silence, and ease.
- Gaps between modular content sections leverage `space-xl` (or multiples thereof) to visually partition distinct phases of the guest journey.

## Elevation & Depth

This design system uses a strictly flat, shadowless elevation model. Visual depth is articulated exclusively through structural boundary lines and tonal surface shifts.

### Depth Principles
- **No Drop Shadows:** Blur radiuses, elevation drop shadows, and soft ambient glows are completely omitted.
- **Tonal Plane Shifts:** Surfaces sit on `#FFFFFF`. Secondary groupings (such as suite amenity specs, calendar pickers, or pricing summaries) occupy flat `#F6F6F4` backdrops.
- **1px Hairline Boundaries:** Interfaces demarcate hierarchy using crisp, continuous 1px rules in `#E2E2DF`. Where high contrast or active focus is required, lines transition to `#1E1E1E`.
- **Modals & Overlays:** Slide-in sheets and modal dialogs do not float on blurred backdrops; they use sharp `#FFFFFF` planes framed by a 1px `#1E1E1E` border, overlaid on a solid 40% `#1E1E1E` translucent wash.

## Shapes

The design system enforces complete rectilinear purity across all UI elements.

### Geometric Rules
- **Universal Zero Radius:** Buttons, inputs, image containers, badges, cards, modal windows, and notification bars carry an absolute `0px` border radius (`roundedness: 0`).
- **Image Frame Treatment:** All photography must feature unrounded sharp 90-degree corners. Photography relies on architectural framing, natural light, and quiet composition to complement the crisp linear container.
- **Iconography:** Line-based, monochrome, strictly rendered with 1.25px or 1.5px stroke weight, sharp corners, and no solid heavy fills.

## Components

### Buttons
- **Primary CTA (Sage Solid):** Solid `#7C8B74` background, `#FFFFFF` text, `0px` radius, `12px 24px` padding. Typography set in uppercase tracked label style. Hover transitions cleanly to a deeper sage (`#6A7863`) without shadows.
- **Secondary Button (Graphite Outline):** Transparent background, 1px solid `#1E1E1E` border, `#1E1E1E` text. On hover, inverts to solid `#1E1E1E` background with `#FFFFFF` text.
- **Text Link Button:** `#1E1E1E` label with a persistent 1px hairline underline positioned 4px beneath the text. On hover, the underline shifts to `#7C8B74`.

### Input Fields & Selectors
- **Form Controls:** Background `#FFFFFF` (or `#F6F6F4` inside tonal blocks) framed by a 1px `#E2E2DF` border. Zero corner radius. `12px 16px` padding.
- **Focus State:** Border shifts directly from `#E2E2DF` to `#1E1E1E`. No outer ring or glow.
- **Labeling:** Floating or top-aligned labels rendered in `label-uppercase` (`#8A8A86`).

### Checkboxes & Radio Buttons
- **Checkbox:** Square 16x16px container with a 1px `#1E1E1E` border and `0px` corner radius. When checked, fills with `#1E1E1E` displaying a crisp 1px white checkmark.
- **Radio Button:** Square 16x16px boundary with a centered solid 8x8px square dot when active. Circular variants are avoided to preserve rectilinear cohesion.

### Room & Amenity Cards
- **Structure:** Solid `#FFFFFF` or `#F6F6F4` background container framed by a 1px `#E2E2DF` outer hairline.
- **Media Asset:** Top-aligned 4:3 or 16:9 aspect ratio image, full bleed to the card borders, sharp 0px corners.
- **Metadata Layout:** Separated from image by a 1px hairline. Room category displayed in uppercase tracking, rate presented in `headline-sm`, and key inclusions listed with minimal line icons.

### Badges & Chips
- **Status Badges:** Sharp rectangular blocks, `4px 8px` padding, 1px hairline border in `#8A8A86` or filled with subtle `#F6F6F4`. Text in `label-uppercase`.

### Dividers & Structural Tables
- **Dividers:** Full-width or inset 1px horizontal rule in `#E2E2DF`.
- **Booking Summary & Availability Grid:** Matrix-style grid separated by alternating white and off-white bands, with single-pixel horizontal grid lines enforcing orderly alignment.