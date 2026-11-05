import { describe, expect, it } from "vitest";
import th from "@/lib/i18n/th";
import en from "@/lib/i18n/en";
import {
  ROOM_AMENITY_GROUPS,
  ROOM_AMENITY_KEYS,
  isRoomAmenityKey,
  normalizeAmenities,
  type RoomAmenityGroupKey,
  type RoomAmenityKey,
} from "./roomAmenities";

describe("ROOM_AMENITY_KEYS", () => {
  it("contains exactly 30 canonical amenity keys", () => {
    expect(ROOM_AMENITY_KEYS).toHaveLength(30);
  });

  it("contains all unique keys with no duplicates", () => {
    const keySet = new Set(ROOM_AMENITY_KEYS);
    expect(keySet.size).toBe(30);
    expect(keySet.size).toBe(ROOM_AMENITY_KEYS.length);
  });

  it("formats all keys as lowercase snake_case", () => {
    const snakeCaseRegex = /^[a-z]+(_[a-z]+)*$/;
    for (const key of ROOM_AMENITY_KEYS) {
      expect(key).toMatch(snakeCaseRegex);
    }
  });

  it("ensures each key string length is between 1 and 40 characters", () => {
    for (const key of ROOM_AMENITY_KEYS) {
      expect(key.length).toBeGreaterThanOrEqual(1);
      expect(key.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("ROOM_AMENITY_GROUPS", () => {
  const EXPECTED_GROUPS: { key: RoomAmenityGroupKey; items: RoomAmenityKey[] }[] = [
    {
      key: "popular",
      items: [
        "air_conditioning",
        "fan",
        "free_wifi",
        "tv",
        "refrigerator",
        "hot_water",
        "private_bathroom",
        "balcony",
        "view",
      ],
    },
    {
      key: "in_room",
      items: [
        "kettle",
        "wardrobe",
        "desk",
        "safe",
        "kitchenette",
        "microwave",
        "mosquito_net",
      ],
    },
    {
      key: "bathroom",
      items: ["bathtub", "hair_dryer", "towels", "toiletries"],
    },
    {
      key: "outdoor",
      items: [
        "private_pool",
        "terrace",
        "washing_machine",
        "bbq",
        "non_smoking",
        "extra_bed",
      ],
    },
    {
      key: "access",
      items: [
        "ground_floor",
        "elevator",
        "wheelchair_accessible",
        "grab_rails",
      ],
    },
  ];

  it("contains all 5 canonical groups in the required sequence", () => {
    const groupKeys = ROOM_AMENITY_GROUPS.map((g) => g.key);
    expect(groupKeys).toEqual([
      "popular",
      "in_room",
      "bathroom",
      "outdoor",
      "access",
    ]);
  });

  it("matches the exact item taxonomy per group specified in ORIGINAL_REQUEST.md", () => {
    expect(ROOM_AMENITY_GROUPS).toEqual(EXPECTED_GROUPS);
  });

  it("has exactly 30 total keys across all groups matching ROOM_AMENITY_KEYS in order", () => {
    const flattened = ROOM_AMENITY_GROUPS.flatMap((g) => g.items);
    expect(flattened).toHaveLength(30);
    expect(flattened).toEqual(ROOM_AMENITY_KEYS);
  });

  it("ensures each amenity key appears in exactly one group (mutually exclusive)", () => {
    const seen = new Set<string>();
    for (const group of ROOM_AMENITY_GROUPS) {
      for (const item of group.items) {
        expect(seen.has(item)).toBe(false);
        seen.add(item);
      }
    }
    expect(seen.size).toBe(30);
  });
});

describe("isRoomAmenityKey", () => {
  it("returns true for all 30 canonical keys", () => {
    for (const key of ROOM_AMENITY_KEYS) {
      expect(isRoomAmenityKey(key)).toBe(true);
    }
  });

  it("returns true for specific boundary keys", () => {
    expect(isRoomAmenityKey("air_conditioning")).toBe(true);
    expect(isRoomAmenityKey("bathtub")).toBe(true);
    expect(isRoomAmenityKey("grab_rails")).toBe(true);
  });

  it("returns false for unknown English strings", () => {
    expect(isRoomAmenityKey("wifi")).toBe(false);
    expect(isRoomAmenityKey("breakfast")).toBe(false);
    expect(isRoomAmenityKey("spa")).toBe(false);
    expect(isRoomAmenityKey("gym")).toBe(false);
    expect(isRoomAmenityKey("swimming_pool")).toBe(false);
    expect(isRoomAmenityKey("kitchen")).toBe(false);
    expect(isRoomAmenityKey("amenity")).toBe(false);
  });

  it("returns false for case mismatches and padded strings", () => {
    expect(isRoomAmenityKey("AIR_CONDITIONING")).toBe(false);
    expect(isRoomAmenityKey("Air_Conditioning")).toBe(false);
    expect(isRoomAmenityKey("tv ")).toBe(false);
    expect(isRoomAmenityKey(" tv")).toBe(false);
    expect(isRoomAmenityKey("TV")).toBe(false);
  });

  it("returns false for empty or whitespace-only strings", () => {
    expect(isRoomAmenityKey("")).toBe(false);
    expect(isRoomAmenityKey(" ")).toBe(false);
    expect(isRoomAmenityKey("\t")).toBe(false);
    expect(isRoomAmenityKey("\n")).toBe(false);
  });

  it("returns false for non-string values safely", () => {
    expect(isRoomAmenityKey(null)).toBe(false);
    expect(isRoomAmenityKey(undefined)).toBe(false);
    expect(isRoomAmenityKey(0)).toBe(false);
    expect(isRoomAmenityKey(1)).toBe(false);
    expect(isRoomAmenityKey(42)).toBe(false);
    expect(isRoomAmenityKey(NaN)).toBe(false);
    expect(isRoomAmenityKey(Infinity)).toBe(false);
    expect(isRoomAmenityKey(true)).toBe(false);
    expect(isRoomAmenityKey(false)).toBe(false);
    expect(isRoomAmenityKey({})).toBe(false);
    expect(isRoomAmenityKey([])).toBe(false);
    expect(isRoomAmenityKey({ key: "tv" })).toBe(false);
    expect(isRoomAmenityKey(["air_conditioning"])).toBe(false);
    expect(isRoomAmenityKey(() => "tv")).toBe(false);
    expect(isRoomAmenityKey(Symbol("tv"))).toBe(false);
  });

  it("returns false for prototype property names", () => {
    expect(isRoomAmenityKey("__proto__")).toBe(false);
    expect(isRoomAmenityKey("constructor")).toBe(false);
    expect(isRoomAmenityKey("toString")).toBe(false);
    expect(isRoomAmenityKey("valueOf")).toBe(false);
  });
});

describe("normalizeAmenities", () => {
  it("filters out unknown keys", () => {
    expect(
      normalizeAmenities(["unknown", "air_conditioning", "foobar"]),
    ).toEqual(["air_conditioning"]);
    expect(normalizeAmenities(["wifi", "gym", "spa"])).toEqual([]);
  });

  it("deduplicates identical keys", () => {
    expect(normalizeAmenities(["tv", "tv", "tv"])).toEqual(["tv"]);
    expect(
      normalizeAmenities(["fan", "air_conditioning", "fan", "air_conditioning"]),
    ).toEqual(["air_conditioning", "fan"]);
  });

  it("sorts keys in canonical order defined by ROOM_AMENITY_KEYS", () => {
    // Within same group: view (index 8) and air_conditioning (index 0)
    expect(normalizeAmenities(["view", "air_conditioning"])).toEqual([
      "air_conditioning",
      "view",
    ]);

    // Across different groups: grab_rails (access), bbq (outdoor), kettle (in_room), tv (popular)
    expect(
      normalizeAmenities(["grab_rails", "bbq", "kettle", "tv"]),
    ).toEqual(["tv", "kettle", "bbq", "grab_rails"]);
  });

  it("sorts the entire reversed list back to canonical order", () => {
    const reversed = [...ROOM_AMENITY_KEYS].reverse();
    expect(normalizeAmenities(reversed)).toEqual(ROOM_AMENITY_KEYS);
  });

  it("handles empty arrays", () => {
    expect(normalizeAmenities([])).toEqual([]);
  });

  it("handles null and undefined safely without throwing", () => {
    expect(normalizeAmenities(null)).toEqual([]);
    expect(normalizeAmenities(undefined)).toEqual([]);
  });

  it("handles non-array inputs safely without throwing", () => {
    expect(normalizeAmenities("air_conditioning")).toEqual([]);
    expect(normalizeAmenities(123)).toEqual([]);
    expect(normalizeAmenities(true)).toEqual([]);
    expect(normalizeAmenities({})).toEqual([]);
    expect(normalizeAmenities({ key: "tv" })).toEqual([]);
  });

  it("ignores non-string or invalid items mixed inside arrays", () => {
    expect(
      normalizeAmenities([
        null,
        "tv",
        undefined,
        42,
        {},
        "free_wifi",
        true,
        [],
      ]),
    ).toEqual(["free_wifi", "tv"]);
  });

  it("filters adversarial strings and special characters", () => {
    expect(
      normalizeAmenities([
        "__proto__",
        "constructor",
        "<script>alert(1)</script>",
        "air_conditioning\n",
        "tv\0",
        "refrigerator",
      ]),
    ).toEqual(["refrigerator"]);
  });

  it("does not mutate the input array (pure function)", () => {
    const input = ["view", "air_conditioning"];
    const inputCopy = [...input];
    const result = normalizeAmenities(input);

    expect(input).toEqual(inputCopy);
    expect(result).not.toBe(input);
  });

  it("handles all 30 valid keys with extra duplicates and garbage", () => {
    const scrambled = [
      ...ROOM_AMENITY_KEYS.slice(15),
      "bogus_item",
      ...ROOM_AMENITY_KEYS.slice(0, 15),
      "tv",
      null,
    ];
    expect(normalizeAmenities(scrambled)).toEqual(ROOM_AMENITY_KEYS);
  });
});

describe("roomAmenities i18n translation completeness", () => {
  it("verifies every key in ROOM_AMENITY_KEYS has a corresponding translation in both th.ts and en.ts", () => {
    for (const key of ROOM_AMENITY_KEYS) {
      const thaiTranslation = th.roomAmenities.items[key];
      const englishTranslation = en.roomAmenities.items[key];

      expect(thaiTranslation).toBeDefined();
      expect(typeof thaiTranslation).toBe("string");
      expect(thaiTranslation.trim().length).toBeGreaterThan(0);

      expect(englishTranslation).toBeDefined();
      expect(typeof englishTranslation).toBe("string");
      expect(englishTranslation.trim().length).toBeGreaterThan(0);
    }
  });

  it("verifies there are no extra or missing amenity items in th.ts or en.ts", () => {
    const thaiKeys = Object.keys(th.roomAmenities.items).sort();
    const englishKeys = Object.keys(en.roomAmenities.items).sort();
    const canonicalKeys = [...ROOM_AMENITY_KEYS].sort();

    expect(thaiKeys).toEqual(canonicalKeys);
    expect(englishKeys).toEqual(canonicalKeys);
  });

  it("verifies every group in ROOM_AMENITY_GROUPS has a corresponding translation in both th.ts and en.ts", () => {
    for (const group of ROOM_AMENITY_GROUPS) {
      const thaiGroup = th.roomAmenities.groups[group.key];
      const englishGroup = en.roomAmenities.groups[group.key];

      expect(thaiGroup).toBeDefined();
      expect(typeof thaiGroup).toBe("string");
      expect(thaiGroup.trim().length).toBeGreaterThan(0);

      expect(englishGroup).toBeDefined();
      expect(typeof englishGroup).toBe("string");
      expect(englishGroup.trim().length).toBeGreaterThan(0);
    }
  });

  it("verifies there are no extra or missing amenity groups in th.ts or en.ts", () => {
    const canonicalGroupKeys = ROOM_AMENITY_GROUPS.map((g) => g.key).sort();
    const thaiGroupKeys = Object.keys(th.roomAmenities.groups).sort();
    const englishGroupKeys = Object.keys(en.roomAmenities.groups).sort();

    expect(thaiGroupKeys).toEqual(canonicalGroupKeys);
    expect(englishGroupKeys).toEqual(canonicalGroupKeys);
  });

  it("verifies picker and expander UI labels are present in both th.ts and en.ts", () => {
    expect(th.roomAmenities.pickerTitle).toBe("สิ่งอำนวยความสะดวกในห้องพัก");
    expect(en.roomAmenities.pickerTitle).toBe("Room amenities");

    expect(th.roomAmenities.pickerDescription).toBe("เปิดสวิตช์รายการที่ห้องประเภทนี้มี ลูกค้าจะเห็นตอนเลือกห้อง");
    expect(en.roomAmenities.pickerDescription).toBe("Turn on amenities available in this room type. Guests will see them when choosing a room.");

    expect(th.roomAmenities.moreItems).toContain("{{count}}");
    expect(en.roomAmenities.moreItems).toContain("{{count}}");
  });
});
