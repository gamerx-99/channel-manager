// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));

import { PhotosSection, type BuilderMediaItem } from "./PhotosSection";
(globalThis as { React?: typeof React }).React = React;

const photo = (id: string, displayOrder: number, isHero = false): BuilderMediaItem => ({
  id, hotelId: "hotel-1", url: `/${id}.jpg`, caption: null, isHero, isPublished: true, displayOrder, objectPosition: null, isGallerySelected: !isHero, createdAt: new Date(0),
} as unknown as BuilderMediaItem);

afterEach(cleanup);

function renderSection(overrides: Partial<React.ComponentProps<typeof PhotosSection>> = {}) {
  const ordered = [photo("cover", 0, true), photo("g1", 1), photo("g2", 2)];
  const props: React.ComponentProps<typeof PhotosSection> = {
    canManage: true, media: [...ordered, photo("off", 3)], orderedPhotos: ordered, otherPhotos: [{ ...photo("off", 3), isGallerySelected: false }], hasCover: true,
    selectedGalleryIds: ["g1", "g2"], fileInputRef: { current: null }, focalMediaId: null, setFocalMediaId: vi.fn(), handleUploadFiles: vi.fn(),
    handleFocalPoint: vi.fn(), handleSetHero: vi.fn(), handleDeleteMedia: vi.fn(), handleSetCaption: vi.fn(), handleToggleGallery: vi.fn(), handleReorderPhotos: vi.fn(), ...overrides,
  };
  const view = render(<PhotosSection {...props} />);
  return { props, view };
}

describe("PhotosSection controls", () => {
  it("offers positions 1..N with the cover named, and moves only website photo ids", () => {
    const { props } = renderSection();
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(3);
    expect(within(selects[1]).getAllByRole("option").map(option => option.textContent)).toEqual(["1 (Hero image)", "2", "3"]);
    expect((selects[1] as HTMLSelectElement).value).toBe("2");
    fireEvent.change(screen.getByRole("combobox", { name: "Order of photo 3" }), { target: { value: "1" } });
    expect(props.handleReorderPhotos).toHaveBeenCalledWith(["g2", "cover", "g1"]);
    expect(screen.getByTestId("other-photos").querySelector("select")).toBeNull();
  });

  it("does not edit or save from the card image, and opens the editor from its button", () => {
    const setFocalMediaId = vi.fn();
    const handleFocalPoint = vi.fn();
    const { view } = renderSection({ setFocalMediaId, handleFocalPoint });
    const cardImage = screen.getAllByAltText("Hotel media preview")[0];
    expect(cardImage.getAttribute("class")).toContain("wb-card-image");
    expect(Object.keys((cardImage as HTMLElement)).some(key => key.startsWith("__reactProps") && Boolean((cardImage as any)[key].onPointerDown))).toBe(false);
    fireEvent.pointerDown(cardImage, { clientX: 25, clientY: 75 });
    fireEvent.click(cardImage);
    expect(setFocalMediaId).not.toHaveBeenCalled();
    expect(handleFocalPoint).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Adjust position of photo 1" }));
    expect(setFocalMediaId).toHaveBeenCalledWith("cover");
    view.rerender(<PhotosSection {...renderProps(setFocalMediaId, handleFocalPoint)} focalMediaId="cover" />);
    expect(screen.getByLabelText("Horizontal")).toBeTruthy();
    expect(screen.getByLabelText("Vertical")).toBeTruthy();
  });

  it("keeps slider changes local until Save and discards them on Cancel", () => {
    const handleFocalPoint = vi.fn();
    const setFocalMediaId = vi.fn();
    const { view, props } = renderSection({ handleFocalPoint, setFocalMediaId, focalMediaId: "cover" });
    fireEvent.change(screen.getByLabelText("Horizontal"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Vertical"), { target: { value: "75" } });
    expect(handleFocalPoint).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Horizontal") as HTMLInputElement).value).toBe("25");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handleFocalPoint).not.toHaveBeenCalled();
    view.rerender(<PhotosSection {...props} focalMediaId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Adjust position of photo 1" }));
    view.rerender(<PhotosSection {...props} focalMediaId="cover" />);
    expect((screen.getByLabelText("Horizontal") as HTMLInputElement).value).toBe("50");
    fireEvent.change(screen.getByLabelText("Horizontal"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handleFocalPoint).toHaveBeenCalledTimes(1);
    expect(handleFocalPoint).toHaveBeenCalledWith("cover", "25% 50%");
  });

  it("resets locally and sends null only on Save", () => {
    const handleFocalPoint = vi.fn();
    renderSection({ focalMediaId: "cover", handleFocalPoint });
    fireEvent.change(screen.getByLabelText("Horizontal"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to centre" }));
    expect((screen.getByLabelText("Horizontal") as HTMLInputElement).value).toBe("50");
    expect(handleFocalPoint).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handleFocalPoint).toHaveBeenCalledWith("cover", null);
  });

  it("keeps the chosen point in the editor when Save fails", async () => {
    const handleFocalPoint = vi.fn().mockResolvedValue(false);
    const setFocalMediaId = vi.fn();
    renderSection({ focalMediaId: "cover", handleFocalPoint, setFocalMediaId });
    fireEvent.change(screen.getByLabelText("Horizontal"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false));
    expect((screen.getByLabelText("Horizontal") as HTMLInputElement).value).toBe("30");
    expect(setFocalMediaId).not.toHaveBeenCalled();
  });

  it("captures a drag on the editor preview and updates both crop previews", () => {
    const handleFocalPoint = vi.fn();
    renderSection({ focalMediaId: "cover", handleFocalPoint });
    const editor = document.querySelector<HTMLElement>(".wb-focal-editor")!;
    const captured = new Set<number>();
    editor.setPointerCapture = vi.fn(id => { captured.add(id); });
    editor.hasPointerCapture = vi.fn(id => captured.has(id));
    editor.releasePointerCapture = vi.fn(id => { captured.delete(id); });
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 200, height: 100 } as DOMRect);
    fireEvent.pointerDown(editor, { pointerId: 1, clientX: 50, clientY: 75 });
    fireEvent.pointerMove(editor, { pointerId: 1, clientX: 150, clientY: 25 });
    expect((screen.getByLabelText("Horizontal") as HTMLInputElement).value).toBe("75");
    expect((screen.getByLabelText("Vertical") as HTMLInputElement).value).toBe("25");
    expect(document.querySelectorAll('.wb-focal-editor img[style*="75% 25%"], .wb-focal-editor ~ div img[style*="75% 25%"]')).toHaveLength(3);
    fireEvent.pointerUp(editor, { pointerId: 1 });
    expect(editor.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(handleFocalPoint).not.toHaveBeenCalled();
  });
});

function renderProps(setFocalMediaId: (id: string | null) => void, handleFocalPoint: (id: string, position: string | null) => Promise<boolean>): React.ComponentProps<typeof PhotosSection> {
  const ordered = [photo("cover", 0, true), photo("g1", 1), photo("g2", 2)];
  return { canManage: true, media: [...ordered, photo("off", 3)], orderedPhotos: ordered, otherPhotos: [photo("off", 3)], hasCover: true, selectedGalleryIds: ["g1", "g2"], fileInputRef: { current: null }, focalMediaId: null, setFocalMediaId, handleUploadFiles: vi.fn(), handleFocalPoint, handleSetHero: vi.fn(), handleDeleteMedia: vi.fn(), handleSetCaption: vi.fn(), handleToggleGallery: vi.fn(), handleReorderPhotos: vi.fn() };
}
