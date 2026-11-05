export const ROOM_AMENITY_GROUPS = [
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
    items: [
      "bathtub",
      "hair_dryer",
      "towels",
      "toiletries",
    ],
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
] as const;

export type RoomAmenityGroupKey = (typeof ROOM_AMENITY_GROUPS)[number]["key"];
export type RoomAmenityKey = (typeof ROOM_AMENITY_GROUPS)[number]["items"][number];

export type AmenityGroup = {
  readonly key: RoomAmenityGroupKey;
  readonly items: readonly RoomAmenityKey[];
};

export const ROOM_AMENITY_KEYS: readonly RoomAmenityKey[] = ROOM_AMENITY_GROUPS.flatMap(
  group => group.items,
);

const ROOM_AMENITY_KEY_SET = new Set<string>(ROOM_AMENITY_KEYS);

/**
 * Type guard verifying if an unknown value is one of the 30 canonical room amenity keys.
 */
export function isRoomAmenityKey(value: unknown): value is RoomAmenityKey {
  return typeof value === "string" && ROOM_AMENITY_KEY_SET.has(value);
}

/**
 * Normalizes an amenity key array: discards unknown keys, eliminates duplicates,
 * and sorts the result according to canonical ROOM_AMENITY_KEYS ordering.
 */
export function normalizeAmenities(values: unknown): RoomAmenityKey[] {
  // ASSUMPTION: Unknown amenity keys are discarded (no legacy data exists yet because migration has not been applied)
  if (!Array.isArray(values)) {
    return [];
  }

  const presented = new Set<string>();
  for (const item of values) {
    if (isRoomAmenityKey(item)) {
      presented.add(item);
    }
  }

  return ROOM_AMENITY_KEYS.filter(key => presented.has(key));
}
