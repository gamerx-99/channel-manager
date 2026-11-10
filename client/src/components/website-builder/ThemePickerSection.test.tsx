// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const languageState = vi.hoisted(() => ({ language: "en" as "en" | "th" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: languageState.language, setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));

import { ThemePickerSection } from "./ThemePickerSection";
 (globalThis as { React?: typeof React }).React = React;

afterEach(() => { cleanup(); languageState.language = "en"; });

describe("ThemePickerSection", () => {
  it("shows save validation feedback beside the theme cards", () => {
    render(<ThemePickerSection currentTheme="minimal-white" canManage isPending={false} error="Hero copy cannot be empty." onSelectTheme={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toBe("Hero copy cannot be empty.");
  });

  it("renders the suits line in the current language", () => {
    render(<ThemePickerSection currentTheme="minimal-white" canManage isPending={false} onSelectTheme={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Pure/ }).textContent).toContain("Suits: New homestays / modern rooms");
  });

  it("keeps the brand and Pro together while the Thai reading wraps as a whole", () => {
    languageState.language = "th";
    render(<ThemePickerSection currentTheme="mountain-mist" canManage isPending={false} onSelectTheme={vi.fn()} />);

    const card = screen.getByRole("button", { name: /Terra/ });
    const grid = card.parentElement;
    const brand = screen.getByText("Terra");
    const reading = screen.getByText("เทอร์ร่า");
    expect(grid?.classList.contains("grid-cols-1")).toBe(true);
    expect(grid?.classList.contains("sm:grid-cols-3")).toBe(true);
    expect(card.contains(brand)).toBe(true);
    expect(brand.parentElement?.classList.contains("whitespace-nowrap")).toBe(true);
    expect(brand.parentElement?.textContent).toBe("TerraPro");
    expect(reading.classList.contains("whitespace-nowrap")).toBe(true);
    expect(reading.classList.contains("text-xs")).toBe(true);
    expect(card.textContent).toContain("เหมาะกับ: ที่พักในป่า / ริมน้ำ / บนดอย");
  });

  it("shows only the English brand in the English UI", () => {
    render(<ThemePickerSection currentTheme="mountain-mist" canManage isPending={false} onSelectTheme={vi.fn()} />);
    const card = screen.getByRole("button", { name: /Terra/ });
    expect(card.textContent).toContain("TerraPro");
    expect(card.textContent).not.toContain("เทอร์ร่า");
  });
});
