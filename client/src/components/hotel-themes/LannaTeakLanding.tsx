import React from "react";
import { ThemeLanding, type ThemeLandingProps } from "./ThemeLanding";
export default function LannaTeakLanding(props: Omit<ThemeLandingProps, "themeId"> & { children: React.ReactNode }) { return <ThemeLanding {...props} themeId="lanna-teak" />; }
