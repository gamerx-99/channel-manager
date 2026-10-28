---
name: Nap & Latte Homestay
colors:
  surface: '#fff8f0'
  surface-dim: '#dfd9d0'
  surface-bright: '#fff8f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f9f3ea'
  surface-container: '#f4ede4'
  surface-container-high: '#eee7de'
  surface-container-highest: '#e8e2d9'
  on-surface: '#1e1b16'
  on-surface-variant: '#4f453f'
  inverse-surface: '#33302a'
  inverse-on-surface: '#f7f0e7'
  outline: '#81756e'
  outline-variant: '#d3c3bc'
  surface-tint: '#735949'
  primary: '#321f12'
  on-primary: '#ffffff'
  primary-container: '#4a3426'
  on-primary-container: '#bb9c8a'
  inverse-primary: '#e1c0ac'
  secondary: '#7a573d'
  on-secondary: '#ffffff'
  secondary-container: '#fdcead'
  on-secondary-container: '#79563c'
  tertiary: '#16280b'
  on-tertiary: '#ffffff'
  tertiary-container: '#2b3e1f'
  on-tertiary-container: '#92a981'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbc7'
  primary-fixed-dim: '#e1c0ac'
  on-primary-fixed: '#29170b'
  on-primary-fixed-variant: '#594233'
  secondary-fixed: '#ffdcc5'
  secondary-fixed-dim: '#ebbd9e'
  on-secondary-fixed: '#2d1503'
  on-secondary-fixed-variant: '#5f4028'
  tertiary-fixed: '#d2eabe'
  tertiary-fixed-dim: '#b6cea3'
  on-tertiary-fixed: '#0e2005'
  on-tertiary-fixed-variant: '#384c2b'
  background: '#fff8f0'
  on-background: '#1e1b16'
  surface-variant: '#e8e2d9'
typography:
  display:
    fontFamily: Epilogue
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Epilogue
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Epilogue
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Epilogue
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
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
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Be Vietnam Pro
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
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies the warmth of a boutique café tucked into the morning mist of Pai, Mae Hong Son, seamlessly blended with the unhurried comfort of a countryside homestay. It captures the concept of "sip slow, sleep soundly"—bridging relaxed northern Thai hospitality with tactile, Instagram-ready café aesthetics.

The visual style blends soft neomorphism, tactile scrapbook warmth, and playful editorial styling. Surfaces feel like smooth ceramic tableware, steamed milk foam, and natural linen. Visuals invite lingering exploration through gently angled Polaroid photo frames, organic hand-drawn line doodles (latte cups, clouds, Pai mountain ridges, tea leaves), and chunky, touchable controls that respond with friendly, buoyant micro-interactions.

## Colors

The palette balances soft, milky pastels with deep, grounding roast notes to ensure rich warmth and strict WCAG AA legibility:

- **Primary Cocoa Roast (`#4A3426`):** Grounding anchor used for high-contrast primary typography, key icons, active state indicators, and solid pill action buttons.
- **Secondary Pastel Peach (`#F7C8A8`):** Dawn glow accent applied to hero backdrops, promotional badges, alert highlights, and interactive callout panels.
- **Tertiary Matcha Herb (`#B7CFA4`):** Earthy accent inspired by the Pai valley, used for amenity chips, availability indicators, confirmed states, and botanical touches.
- **Calm Sky Mist (`#BFD9EA`):** Atmospheric accent for seasonal retreat packages, quiet relaxation tags, weather displays, and secondary badges.
- **Milk Cream Canvas (`#FFF8EF`):** Main application canvas and primary page surface, radiating soft, warm morning light.
- **Warm Ceramic Tint (`#FFFDF9`):** Elevated card surface, modal backdrop, and polaroid photo frame base.
- **Toasted Sand Border (`#EAD9C6`):** Subtle border tone providing organic definition without harsh lines.

Use `#4A3426` for all primary readable text on `#FFF8EF`, `#FFFDF9`, and `#F7C8A8`, comfortably exceeding 7:1 contrast ratios.

## Typography

Typography pairs expressive, characterful headings with clean, airy body text to maintain optimal bilingual rhythm across English and Thai.

- **Headings & Display:** Epilogue delivers bold, curvy, hand-crafted geometry suited for café menus, homestay titles, and friendly welcome moments. In web contexts targeting primary Thai script delivery, fall back seamlessly to Google Fonts `Mali` for full handwriting character.
- **Body & Controls:** Be Vietnam Pro brings warm humanist clarity with open apertures and clean terminals. In Thai contexts, map directly to `K2D` for clean, contemporary legibility across descriptions, pricing tables, and booking forms.
- **Rhythm & Line Length:** Body paragraphs are constrained to a maximum of 65 characters per line (`max-w-prose`) to preserve a relaxing, bookish cadence.

## Layout & Spacing

The layout philosophy follows an airy, relaxed fluid-grid rhythm mirroring the open pavilions and sun decks of northern Thailand:

- **Desktop (1024px+):** 12-column fluid grid, `3rem` canvas margins, and `1.5rem` gutters. Elements span asymmetric 5/7 or 4/8 column pairings to evoke informal scrapbook journals.
- **Tablet (768px - 1023px):** 8-column grid with `2rem` margins and `1.25rem` gutters.
- **Mobile (< 768px):** 4-column grid with `1.25rem` margins and `1rem` gutters. Cards stretch edge-to-edge with inset container padding to optimize thumb targets.
- **Vertical Spacing:** Generous section spacing (`space-xl` to double `space-xl`) prevents visual clutter, allowing photography and cozy copy to breathe effortlessly.

## Elevation & Depth

Elevation eschews stark synthetic shadows in favor of warm, espresso-tinted ambient glows that simulate filtered northern sunlight:

- **Base Layer (Flat):** Milk Cream (`#FFF8EF`) acts as the natural canvas.
- **Subtle Elevation (`shadow-sm`):** `0 2px 4px 0 rgba(74, 52, 38, 0.04)`. Applied to inactive pill chips, input fields, and quiet badges.
- **Ambient Card Elevation (`shadow-md`):** `0 10px 25px -5px rgba(74, 52, 38, 0.08), 0 4px 6px -2px rgba(74, 52, 38, 0.04)`. Used on primary homestay room cards, menu cards, and interactive modal dialogs.
- **Floating Pill Elevation (`shadow-lg`):** `0 14px 28px -6px rgba(74, 52, 38, 0.14)`. Applied to sticky booking bars, primary buttons, and floating bottom navigation.
- **Polaroid Framing:** Polaroid elements use an opaque `#FFFFFF` substrate, a delicate `1px solid #EAD9C6` edge, and an offset ambient shadow to produce an authentic printed photo feel.

## Shapes

The design system embraces an ultra-soft, rounded silhouette that feels hand-shaped, friendly, and utterly approachable:

- **Hero & Content Cards:** Utilize an oversized `28px` corner radius (`rounded-3xl` / `rounded-[28px]`), imparting a soft, cushiony feel.
- **Polaroid Photo Cards:** Styled with `16px` corner radius (`rounded-2xl`), nested interior photos with `10px` radius, and playful rotational offsets (`-3deg` to `+3deg`) on alternate cards.
- **Pills & Interactive Controls:** Styled with full continuous curvature (`rounded-full`) across buttons, search inputs, tags, and chips.
- **Organic Borders:** Fine, warm borders (`1.5px solid #EAD9C6`) frame cards and inputs, ensuring tactile softness without mechanical sharp edges.

## Components

### Buttons
- **Primary Pill:** Background Cocoa Brown (`#4A3426`), text Milk Cream (`#FFF8EF`), fully rounded (`rounded-full`), padded `px-8 py-3.5`. Interactivity features a playful physical spring: hover scales slightly to `1.03` with an increased warm shadow; active/press depresses to `0.97` with a bounce easing curve (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
- **Secondary Pill:** Background Pastel Peach (`#F7C8A8`), text Cocoa Brown (`#4A3426`), border `1.5px solid rgba(74, 52, 38, 0.1)`.
- **Ghost Pill:** Transparent background, text Cocoa Brown (`#4A3426`), border `1.5px solid #EAD9C6`. Hover fills with Warm Ceramic Tint (`#FFFDF9`).

### Polaroid Cards & Gallery Frames
- Constructed with a crisp white frame (`bg-white` or `#FFFDF9`), padding `p-3.5 pb-6`, ambient shadow, and gentle static tilt (`rotate-[-2deg]` or `rotate-[2deg]`).
- Includes handwritten caption placement centered within the bottom chin using `label-lg` or cursive script. Hovering straightens the frame to `rotate-0` with smooth transition timing.

### Chips & Filter Tags
- Fully rounded (`rounded-full`), `px-4 py-2`, font size `label-md`.
- Unselected: Background `#FFFDF9`, border `1px solid #EAD9C6`, text `#4A3426`.
- Selected: Matcha Green (`#B7CFA4`) or Pastel Peach (`#F7C8A8`), accompanied by an optional hand-drawn mini checkmark or leaf icon.

### Form Inputs & Date Pickers
- Pill-shaped (`rounded-full`) or ultra-rounded (`rounded-2xl`) with `1.5px solid #EAD9C6`, background `#FFFDF9`, and text `#4A3426`.
- Focus state softens the border to `#F7C8A8` accompanied by an espresso halo glow (`box-shadow: 0 0 0 3px rgba(247, 200, 168, 0.45)`).
- Input labels rest warmly above fields in `label-md` Cocoa Brown with subtle coffee bean iconography.

### Homestay Room & Café Cards
- Framed in `28px` rounded corners, warm ceramic surface (`#FFFDF9`), soft ambient shadow, and internal padding of `1.5rem`.
- Features an image container with rounded top corners, amenity badges floating as matcha/sky-blue pills, and clear night/cup pricing in bold primary display typography.