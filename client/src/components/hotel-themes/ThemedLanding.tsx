import { lazy, Suspense } from "react";
import type { HotelThemeId } from "./registry";
import type { HotelThemeLandingProps } from "./shared";

// Each theme (and its CSS) is a separate chunk, loaded only when that theme is requested.
const THEME_COMPONENTS = {
  "minimal-white": lazy(() => import("./MinimalWhiteLanding")),
} satisfies Partial<Record<HotelThemeId, unknown>>;

export function hasThemeComponent(themeId: HotelThemeId): themeId is keyof typeof THEME_COMPONENTS {
  return themeId in THEME_COMPONENTS;
}

export function ThemedLanding({ themeId, fallback, ...props }: HotelThemeLandingProps & { themeId: keyof typeof THEME_COMPONENTS; fallback: React.ReactNode }) {
  const Landing = THEME_COMPONENTS[themeId];
  return (
    <Suspense fallback={fallback}>
      <Landing {...props} />
    </Suspense>
  );
}
