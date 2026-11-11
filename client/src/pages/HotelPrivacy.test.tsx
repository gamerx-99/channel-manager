// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({ query: { data: undefined as unknown, isLoading: false, error: null as unknown } }));
vi.mock("@/lib/trpc", () => ({ trpc: { channelManager: { publicHotel: { useQuery: () => mocks.query } } } }));

import HotelPrivacy from "./HotelPrivacy";

afterEach(cleanup);

describe("hotel privacy page", () => {
  it("shows the hotel's notice with its name", () => {
    mocks.query = { data: { hotel: { name: "Little Bro", slug: "littlebromhs", address: "Mae Hong Son", public_phone: null } }, isLoading: false, error: null };
    render(<HotelPrivacy slug="littlebromhs" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy notice of Little Bro");
    expect(screen.getByTestId("hotel-privacy").querySelectorAll("section")).toHaveLength(10);
    expect(screen.getByRole("link", { name: /Back to Little Bro/ }).getAttribute("href")).toBe("/littlebromhs");
  });

  it("says so for an unknown or unpublished hotel", () => {
    mocks.query = { data: undefined, isLoading: false, error: { data: { code: "NOT_FOUND" } } };
    render(<HotelPrivacy slug="nope" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This privacy notice is not available");
  });

  it("is routed before the hotel page, so /:slug does not swallow it", () => {
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(app.indexOf('path="/:slug/privacy"')).toBeGreaterThan(-1);
    expect(app.indexOf('path="/:slug/privacy"')).toBeLessThan(app.indexOf('path="/:slug"'));
  });
});
