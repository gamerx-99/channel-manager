// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "th", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));

import { PhotosSection, type BuilderMediaItem } from "./PhotosSection";
(globalThis as { React?: typeof React }).React = React;

const photo = (id: string, displayOrder: number, isHero = false): BuilderMediaItem => ({
  id, hotelId: "hotel-1", url: `/${id}.jpg`, caption: null, isHero, isPublished: true, displayOrder, objectPosition: null, isGallerySelected: !isHero, createdAt: new Date(0),
} as unknown as BuilderMediaItem);

// jsdom has no layout. Lay the draggable cards out in one row, 200px apart, so the keyboard
// sensor can find the neighbour to the right of the picked-up photo.
let restoreRect: () => void = () => undefined;
beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const card = this.closest("[data-photo-id]");
    const index = card ? Array.from(card.parentElement!.children).indexOf(card) : 0;
    const left = index * 200;
    return { x: left, y: 0, left, top: 0, right: left + 180, bottom: 100, width: 180, height: 100, toJSON: () => ({}) } as DOMRect;
  };
  restoreRect = () => { Element.prototype.getBoundingClientRect = original; };
});
afterEach(() => { cleanup(); restoreRect(); });

const tick = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

function renderSection(handleReorderPhotos = vi.fn()) {
  const ordered = [photo("cover", 2, true), photo("g1", 0), photo("g2", 1)];
  render(
    <PhotosSection
      canManage
      media={[...ordered, photo("off", 3)]}
      orderedPhotos={ordered}
      otherPhotos={[{ ...photo("off", 3), isGallerySelected: false }]}
      hasCover
      selectedGalleryIds={["g1", "g2"]}
      fileInputRef={{ current: null }}
      focalMediaId={null}
      setFocalMediaId={vi.fn()}
      handleUploadFiles={vi.fn()}
      handleFocalPoint={vi.fn()}
      handleSetHero={vi.fn()}
      handleDeleteMedia={vi.fn()}
      handleSetCaption={vi.fn()}
      handleToggleGallery={vi.fn()}
      handleReorderPhotos={handleReorderPhotos}
      onResetFocalPoint={vi.fn()}
    />,
  );
  return handleReorderPhotos;
}

describe("PhotosSection drag and drop", () => {
  it("moves a photo with the keyboard (Space, arrow, Space) and sends only cover + gallery in the new order", async () => {
    const handleReorderPhotos = renderSection();
    const handle = screen.getByRole("button", { name: "ย้ายรูปที่ 2" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await tick();
    fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowRight", key: "ArrowRight" });
    await tick();
    fireEvent.keyDown(document.activeElement ?? handle, { code: "Space", key: " " });
    await tick();
    expect(handleReorderPhotos).toHaveBeenCalledWith(["cover", "g2", "g1"]);
  });

  it("shows photos not on the website separately, without a drag handle", () => {
    renderSection();
    expect(screen.getAllByRole("button", { name: /^ย้ายรูปที่ \d$/ })).toHaveLength(3);
    const others = screen.getByTestId("other-photos");
    expect(others.querySelector(".wb-drag-handle")).toBeNull();
    expect(screen.getByText("รูปอื่นที่ยังไม่แสดงบนเว็บไซต์")).toBeTruthy();
  });

  it("tells screen readers the move in Thai by position, never by photo id", async () => {
    renderSection();
    const handle = screen.getByRole("button", { name: "ย้ายรูปที่ 3" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await tick();
    expect(document.body.textContent).toContain("หยิบรูปที่ 3 แล้ว");
    expect(document.body.textContent).toContain("กด Space เพื่อหยิบรูป");
    // ArrowLeft twice: from place 3 over the cover (place 1), then drop.
    fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowLeft", key: "ArrowLeft" });
    await tick();
    expect(document.body.textContent).toContain("รูปที่ 3 อยู่ที่ตำแหน่งที่ 2");
    fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowLeft", key: "ArrowLeft" });
    await tick();
    fireEvent.keyDown(document.activeElement ?? handle, { code: "Space", key: " " });
    await tick();
    expect(document.body.textContent).toContain("รูปที่ 3 เป็นรูปหลักแล้ว");
    expect(document.body.textContent).not.toMatch(/Picked up|g2|cover was/);
  });

  it("dropping a gallery photo on the cover sends it first", async () => {
    const handleReorderPhotos = renderSection();
    const handle = screen.getByRole("button", { name: "ย้ายรูปที่ 3" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await tick();
    for (let i = 0; i < 2; i++) { fireEvent.keyDown(document.activeElement ?? handle, { code: "ArrowLeft", key: "ArrowLeft" }); await tick(); }
    fireEvent.keyDown(document.activeElement ?? handle, { code: "Space", key: " " });
    await tick();
    expect(handleReorderPhotos).toHaveBeenCalledWith(["g2", "cover", "g1"]);
  });
});
