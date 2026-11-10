import { describe, expect, it } from "vitest";
import {
  ROOM_AMENITY_GROUPS,
  ROOM_AMENITY_KEYS,
  isRoomAmenityKey,
  normalizeAmenities,
  type RoomAmenityKey,
} from "./roomAmenities";

describe("Adversarial Suite: Prototype Pollution & Hostile Inputs", () => {
  it("rejects prototype pollution string property names", () => {
    const prototypeProperties = [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "valueOf",
      "__defineGetter__",
      "__defineSetter__",
      "__lookupGetter__",
      "__lookupSetter__",
      "hasOwnProperty",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
    ];

    for (const prop of prototypeProperties) {
      expect(isRoomAmenityKey(prop)).toBe(false);
    }

    const normalized = normalizeAmenities(prototypeProperties);
    expect(normalized).toEqual([]);
  });

  it("is resilient against Object.prototype poisoning", () => {
    // Intentionally poison Object.prototype
    const poisonKey = "air_conditioning";
    const rogueKey = "__evil_amenity__";
    const proto = Object.prototype as Record<string, unknown>;

    try {
      proto[rogueKey] = true;
      proto[poisonKey] = true;

      // isRoomAmenityKey should not accept the poisoned key
      expect(isRoomAmenityKey(rogueKey)).toBe(false);

      // Normalizing empty array or unknown keys must not pick up Object.prototype properties
      expect(normalizeAmenities([])).toEqual([]);
      expect(normalizeAmenities([rogueKey])).toEqual([]);
      expect(normalizeAmenities([{}])).toEqual([]);
    } finally {
      delete proto[rogueKey];
      delete proto[poisonKey];
    }
  });

  it("handles array-like objects safely by rejecting them", () => {
    const arrayLike1 = { 0: "air_conditioning", 1: "tv", length: 2 };
    const arrayLike2 = { length: 0 };
    const arrayLike3 = { length: 5 };

    expect(normalizeAmenities(arrayLike1)).toEqual([]);
    expect(normalizeAmenities(arrayLike2)).toEqual([]);
    expect(normalizeAmenities(arrayLike3)).toEqual([]);
  });

  it("handles sparse arrays without throwing or leaking undefined", () => {
    const sparse = new Array<unknown>(500);
    sparse[10] = "tv";
    sparse[250] = "free_wifi";
    sparse[499] = "bogus";

    const result = normalizeAmenities(sparse);
    expect(result).toEqual(["free_wifi", "tv"]);
  });

  it("handles circular references in arrays gracefully", () => {
    const circular: unknown[] = ["tv", "desk"];
    circular.push(circular);

    const result = normalizeAmenities(circular);
    expect(result).toEqual(["tv", "desk"]);
  });

  it("handles exotic primitives, functions, and symbols", () => {
    const exotic = [
      Symbol("air_conditioning"),
      Symbol.iterator,
      Symbol.for("tv"),
      () => "air_conditioning",
      function () {
        return "tv";
      },
      BigInt(42),
      NaN,
      Infinity,
      -Infinity,
      null,
      undefined,
      false,
      true,
      0,
      -0,
      "",
      new Date(),
      /air_conditioning/,
      new Map([["tv", "tv"]]),
      new Set(["tv"]),
      new Int32Array([1, 2, 3]),
      {
        toString() {
          return "air_conditioning";
        },
      },
      {
        valueOf() {
          return "tv";
        },
      },
    ];

    expect(normalizeAmenities(exotic)).toEqual([]);
  });

  it("rejects lookalike strings, padded strings, and null bytes", () => {
    const lookalikes = [
      "\0air_conditioning",
      "air_conditioning\0",
      " air_conditioning",
      "air_conditioning ",
      "air_conditioning\t",
      "air_conditioning\n",
      "air_conditioning\r\n",
      "AIR_CONDITIONING",
      "Air_Conditioning",
      "air-conditioning",
      "air conditioning",
      "air_conditioning_extra",
      "extra_air_conditioning",
      " tv",
      "tv ",
      "TV",
      "ｔｖ", // full-width unicode
      "аir_соnditiоning", // Cyrillic lookalikes
    ];

    for (const str of lookalikes) {
      expect(isRoomAmenityKey(str)).toBe(false);
    }
    expect(normalizeAmenities(lookalikes)).toEqual([]);
  });
});

describe("Adversarial Suite: Huge Arrays & Stress Testing", () => {
  it("handles 50,000 duplicate valid keys efficiently", () => {
    const huge = new Array<string>(50000).fill("tv");
    const start = performance.now();
    const result = normalizeAmenities(huge);
    const duration = performance.now() - start;

    expect(result).toEqual(["tv"]);
    expect(duration).toBeLessThan(150); // Must be very fast (O(N) with fast set insert)
  });

  it("handles 100,000 mixed elements with high entropy", () => {
    const huge: unknown[] = [];
    const validSample: RoomAmenityKey[] = ["air_conditioning", "kettle", "towels", "elevator"];

    for (let i = 0; i < 100000; i++) {
      const mode = i % 10;
      if (mode === 0) {
        huge.push(validSample[Math.floor(i / 10) % validSample.length]);
      } else if (mode === 1) {
        huge.push(`unknown_amenity_${i}`);
      } else if (mode === 2) {
        huge.push(null);
      } else if (mode === 3) {
        huge.push(undefined);
      } else if (mode === 4) {
        huge.push(i);
      } else if (mode === 5) {
        huge.push({ key: "tv" });
      } else if (mode === 6) {
        huge.push(Symbol(`sym_${i}`));
      } else if (mode === 7) {
        huge.push("__proto__");
      } else if (mode === 8) {
        huge.push("constructor");
      } else {
        huge.push(true);
      }
    }

    const start = performance.now();
    const result = normalizeAmenities(huge);
    const duration = performance.now() - start;

    expect(result).toEqual(["air_conditioning", "kettle", "towels", "elevator"]);
    expect(duration).toBeLessThan(250);
  });

  it("handles a sparse array of size 1,000,000 without crashing", () => {
    const sparse = new Array<unknown>(1000000);
    sparse[999999] = "view";

    const start = performance.now();
    const result = normalizeAmenities(sparse);
    const duration = performance.now() - start;

    expect(result).toEqual(["view"]);
    expect(duration).toBeLessThan(500);
  });
});

describe("Adversarial Suite: Canonical Sorting Oracle & Permutations", () => {
  // Oracle: the canonical ground truth
  function referenceOracle(input: unknown[]): RoomAmenityKey[] {
    const present = new Set<string>();
    for (const item of input) {
      if (typeof item === "string" && ROOM_AMENITY_KEYS.includes(item as RoomAmenityKey)) {
        present.add(item);
      }
    }
    return ROOM_AMENITY_KEYS.filter((key) => present.has(key));
  }

  it("strictly matches reference oracle for all 870 2-permutations of canonical keys", () => {
    const keys = [...ROOM_AMENITY_KEYS];
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < keys.length; j++) {
        if (i === j) continue;
        const pair = [keys[i], keys[j]];
        const expected = referenceOracle(pair);
        const actual = normalizeAmenities(pair);
        expect(actual).toEqual(expected);
      }
    }
  });

  it("strictly matches reference oracle across 1,000 randomized full-array shuffles", () => {
    function shuffle<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    for (let trial = 0; trial < 1000; trial++) {
      const shuffled = shuffle(ROOM_AMENITY_KEYS as unknown as string[]);
      const actual = normalizeAmenities(shuffled);
      expect(actual).toEqual(ROOM_AMENITY_KEYS);
    }
  });

  it("strictly matches reference oracle for 500 randomized subsets with variable duplicates and noise", () => {
    function getRandomSubsetWithNoise(): unknown[] {
      const subset: unknown[] = [];
      const keys = [...ROOM_AMENITY_KEYS];

      // Pick random subset of keys
      for (const key of keys) {
        if (Math.random() > 0.4) {
          // Repeat 1 to 4 times
          const count = 1 + Math.floor(Math.random() * 4);
          for (let k = 0; k < count; k++) {
            subset.push(key);
          }
        }
      }

      // Add random garbage
      const garbage = [
        "random_noise",
        "__proto__",
        null,
        undefined,
        123,
        { foo: "bar" },
        "air_conditioning_fake",
      ];
      for (const g of garbage) {
        if (Math.random() > 0.5) {
          subset.push(g);
        }
      }

      // Shuffle the resulting subset
      for (let i = subset.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [subset[i], subset[j]] = [subset[j], subset[i]];
      }

      return subset;
    }

    for (let trial = 0; trial < 500; trial++) {
      const input = getRandomSubsetWithNoise();
      const expected = referenceOracle(input);
      const actual = normalizeAmenities(input);
      expect(actual).toEqual(expected);
    }
  });

  it("maintains inter-group and intra-group relative ordering across all 5 groups", () => {
    // Pick the last item from access, then outdoor, bathroom, in_room, popular (completely reverse group order)
    const reverseGroupItems = [
      "grab_rails", // access
      "extra_bed", // outdoor
      "toiletries", // bathroom
      "mosquito_net", // in_room
      "view", // popular
    ];

    expect(normalizeAmenities(reverseGroupItems)).toEqual([
      "view", // popular
      "mosquito_net", // in_room
      "toiletries", // bathroom
      "extra_bed", // outdoor
      "grab_rails", // access
    ]);
  });
});

describe("Adversarial Suite: Immutability & Reference Integrity", () => {
  it("does not mutate a frozen input array", () => {
    const frozenInput = Object.freeze(["view", "air_conditioning", "kettle", "fake"]);
    expect(() => normalizeAmenities(frozenInput)).not.toThrow();

    const result = normalizeAmenities(frozenInput);
    expect(result).toEqual(["air_conditioning", "view", "kettle"]);
    expect(Object.isFrozen(result)).toBe(false); // result itself is a fresh mutable array
  });

  it("does not mutate elements or order of the input array", () => {
    const input = ["grab_rails", "tv", "bathtub", "tv"];
    const inputSnapshot = JSON.stringify(input);

    const result = normalizeAmenities(input);

    expect(JSON.stringify(input)).toBe(inputSnapshot);
    expect(input).toEqual(["grab_rails", "tv", "bathtub", "tv"]);
    expect(result).not.toBe(input);
  });

  it("ensures mutating the returned array does not affect subsequent calls or ROOM_AMENITY_KEYS", () => {
    const keysSnapshot = [...ROOM_AMENITY_KEYS];

    const res1 = normalizeAmenities(["tv", "air_conditioning"]);
    expect(res1).toEqual(["air_conditioning", "tv"]);

    // Adversarially mutate the returned array
    res1.push("bogus" as RoomAmenityKey);
    res1.reverse();
    res1[0] = "corrupted" as RoomAmenityKey;

    // Call again and verify canonical output is intact
    const res2 = normalizeAmenities(["tv", "air_conditioning"]);
    expect(res2).toEqual(["air_conditioning", "tv"]);

    // Verify ROOM_AMENITY_KEYS was not mutated
    expect(ROOM_AMENITY_KEYS).toEqual(keysSnapshot);
  });

  it("returns a fresh array instance on every call even with identical inputs", () => {
    const input = ["tv"];
    const res1 = normalizeAmenities(input);
    const res2 = normalizeAmenities(input);

    expect(res1).toEqual(res2);
    expect(res1).not.toBe(res2);
  });
});
