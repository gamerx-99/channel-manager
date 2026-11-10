// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BookingStepGuest from "./BookingStepGuest";
import { en } from "@/lib/i18n";

afterEach(() => cleanup());

describe("BookingStepGuest", () => {
  it("starts guest fields empty and uses neutral English placeholders", () => {
    const translations: Record<string, string> = {
      "publicHotel.guestInformation": en.publicHotel.guestInformation,
      "publicHotel.fullName": en.publicHotel.fullName,
      "publicHotel.fullNamePlaceholder": en.publicHotel.fullNamePlaceholder,
      "publicHotel.phoneNumber": en.publicHotel.phoneNumber,
      "publicHotel.phonePlaceholder": en.publicHotel.phonePlaceholder,
      "publicHotel.emailAddress": en.publicHotel.emailAddress,
      "publicHotel.emailPlaceholder": en.publicHotel.emailPlaceholder,
      "publicHotel.specialRequestsLabel": en.publicHotel.specialRequestsLabel,
      "publicHotel.specialRequestsPlaceholder": en.publicHotel.specialRequestsPlaceholder,
      "publicHotel.wizardBack": en.publicHotel.wizardBack,
      "publicHotel.wizardNext": en.publicHotel.wizardNext,
    };
    render(
      <BookingStepGuest
        {...({
          t: (key: string) => translations[key] ?? key,
          guestName: "",
          setGuestName: vi.fn(),
          guestPhone: "",
          setGuestPhone: vi.fn(),
          guestEmail: "",
          setGuestEmail: vi.fn(),
          specialRequests: "",
          setSpecialRequests: vi.fn(),
          confirmDetailsMutation: { isPending: false },
          handleConfirmDetails: vi.fn(),
          setWizardStep: vi.fn(),
        } as any)}
      />,
    );

    const fields = [
      [en.publicHotel.fullNamePlaceholder, "input"],
      [en.publicHotel.phonePlaceholder, "input"],
      [en.publicHotel.emailPlaceholder, "input"],
      [en.publicHotel.specialRequestsPlaceholder, "textarea"],
    ] as const;
    for (const [placeholder, tagName] of fields) {
      const field = screen.getByPlaceholderText(placeholder);
      expect(field.tagName.toLowerCase()).toBe(tagName);
      expect((field as HTMLInputElement | HTMLTextAreaElement).value).toBe("");
      expect(placeholder).not.toMatch(/example|e\.g\.|somchai|guest@|081/i);
    }
  });
});
