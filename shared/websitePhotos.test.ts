import { describe, expect, it } from "vitest";
import { exceedsWebsitePhotoLimit, trimPhotoCaption } from "./websitePhotos";

describe("website photo rules", () => {
  it("allows six selected photos and rejects a seventh", () => {
    expect(exceedsWebsitePhotoLimit(["1", "2", "3", "4", "5", "6"])).toBe(false);
    expect(exceedsWebsitePhotoLimit(["1", "2", "3", "4", "5", "6", "7"])).toBe(true);
  });

  it("trims captions and caps them at 120 characters", () => {
    expect(trimPhotoCaption("  Courtyard at dawn  ")).toBe("Courtyard at dawn");
    expect(trimPhotoCaption("x".repeat(121))).toHaveLength(120);
  });
});

import { displayPhotoCaption } from "./websitePhotos";
describe("displayPhotoCaption", () => {
  it("hides file names left by older uploads and keeps real captions", () => {
    expect(displayPhotoCaption("IMG_1234.JPG")).toBeNull();
    expect(displayPhotoCaption("  ")).toBeNull();
    expect(displayPhotoCaption(null)).toBeNull();
    expect(displayPhotoCaption(" ห้องนอนวิวดอย ")).toBe("ห้องนอนวิวดอย");
  });
});
