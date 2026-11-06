// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));

import { ThemePickerSection } from "./ThemePickerSection";
 (globalThis as { React?: typeof React }).React = React;

afterEach(cleanup);

describe("ThemePickerSection", () => {
  it("shows save validation feedback beside the theme cards", () => {
    render(<ThemePickerSection currentTheme="minimal-white" canManage isPending={false} error="Hero copy cannot be empty." onSelectTheme={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toBe("Hero copy cannot be empty.");
  });
});
