export type PriceAdjustmentMode = 'percent' | 'fixed';
export type ChildPriceMode = 'free' | PriceAdjustmentMode;

export type OccupancyPriceLevel = {
  enabled: boolean;
  mode: PriceAdjustmentMode;
  value: number | string;
};

export type ChildRate = {
  mode: ChildPriceMode;
  value: number | string;
};

export type AgeGroupRate = ChildRate & {
  min_age: number;
  max_age: number;
};

export type ChildRateConfig = {
  infant: ChildRate;
  age_groups: AgeGroupRate[];
  height: ChildRate;
};

export type OccupancyPricingRules = {
  base_occupancy: number;
  max_occupancy: number;
  occupancy_pricing: Record<string, OccupancyPriceLevel>;
  child_rule: 'age' | 'height';
  child_rule_limit: number | string | null;
  child_rates: ChildRateConfig;
  children_count_toward_max: boolean;
};

export type ChildMeasurement = { age: number } | { height_cm: number };
export type ChildRateCounts = { infant: number; age_groups: number[]; height: number };

export function defaultChildRateConfig(): ChildRateConfig {
  return {
    infant: { mode: 'free', value: 0 },
    age_groups: [],
    height: { mode: 'free', value: 0 },
  };
}

export function defaultOccupancyPricing(baseOccupancy: number, maxOccupancy = baseOccupancy): Record<string, OccupancyPriceLevel> {
  return Object.fromEntries(Array.from({ length: maxOccupancy }, (_, index) => {
    const count = index + 1;
    return [String(count), { enabled: count === baseOccupancy, mode: 'percent', value: 0 } satisfies OccupancyPriceLevel];
  }));
}

function matchesChildRate(child: ChildMeasurement, rule: OccupancyPricingRules): 'infant' | number | 'height' | null {
  if (rule.child_rule === 'height') {
    return 'height_cm' in child && rule.child_rule_limit != null && Number(child.height_cm) <= Number(rule.child_rule_limit)
      ? 'height'
      : null;
  }
  if (!('age' in child) || !Number.isFinite(child.age)) return null;
  if (child.age >= 0 && child.age <= 2) return 'infant';
  if (child.age < 3 || child.age > 17) return null;
  const groupIndex = rule.child_rates.age_groups.findIndex(group => child.age >= group.min_age && child.age <= group.max_age);
  return groupIndex >= 0 ? groupIndex : null;
}

export function classifyGuests(children: ChildMeasurement[], rule: OccupancyPricingRules) {
  const childRateCounts: ChildRateCounts = {
    infant: 0,
    age_groups: rule.child_rates.age_groups.map(() => 0),
    height: 0,
  };
  for (const child of children) {
    const match = matchesChildRate(child, rule);
    if (match === 'infant') childRateCounts.infant += 1;
    else if (match === 'height') childRateCounts.height += 1;
    else if (typeof match === 'number') childRateCounts.age_groups[match] += 1;
  }
  const qualifyingChildren = childRateCounts.infant + childRateCounts.height + childRateCounts.age_groups.reduce((sum, count) => sum + count, 0);
  return {
    qualifyingChildren,
    adultEquivalentCount: children.length - qualifyingChildren,
    childRateCounts,
  };
}

export function fitsOccupancy(
  rules: Pick<OccupancyPricingRules, 'base_occupancy' | 'max_occupancy' | 'occupancy_pricing' | 'children_count_toward_max'>,
  adults: number,
  qualifyingChildren: number,
  adultEquivalentChildren: number,
): boolean {
  const guestsCountedForCapacity = adults + adultEquivalentChildren + (rules.children_count_toward_max ? qualifyingChildren : 0);
  const totalGuestCount = adults + adultEquivalentChildren + (rules.children_count_toward_max ? qualifyingChildren : 0);
  const level = rules.occupancy_pricing[String(totalGuestCount)];
  return guestsCountedForCapacity <= rules.max_occupancy
    && adults + adultEquivalentChildren >= 1
    && Boolean(level?.enabled);
}

function applyChildRate(count: number, rate: ChildRate, normalNightlyRate: number): number {
  if (count === 0 || rate.mode === 'free') return 0;
  const value = Number(rate.value);
  return rate.mode === 'fixed' ? count * value : count * normalNightlyRate * value / 100;
}

export function calculateOccupancyPrice(input: {
  nightlyRate: number;
  rules: OccupancyPricingRules;
  totalGuestCount: number;
  childRateCounts: ChildRateCounts;
}): number {
  const { nightlyRate, rules, totalGuestCount, childRateCounts } = input;
  const level = rules.occupancy_pricing[String(totalGuestCount)];
  if (!level?.enabled) throw new Error(`Occupancy level ${totalGuestCount} is not bookable.`);
  const value = Number(level.value);
  const roomPrice = level.mode === 'fixed'
    ? nightlyRate + value
    : nightlyRate * (1 + value / 100);
  const ageGroupPrices = rules.child_rates.age_groups.reduce(
    (sum, rate, index) => sum + applyChildRate(childRateCounts.age_groups[index] ?? 0, rate, nightlyRate),
    0,
  );
  const childPrice = applyChildRate(childRateCounts.infant, rules.child_rates.infant, nightlyRate)
    + ageGroupPrices
    + applyChildRate(childRateCounts.height, rules.child_rates.height, nightlyRate);
  return Math.round(Math.max(0, roomPrice + childPrice) * 100) / 100;
}

export function calculateStayOccupancyPrice(input: {
  nightlyRates: number[];
  rules: OccupancyPricingRules;
  totalGuestCount: number;
  childRateCounts: ChildRateCounts;
}) {
  const nightlyPrices = input.nightlyRates.map(nightlyRate => calculateOccupancyPrice({
    ...input,
    nightlyRate,
  }));
  return {
    nightlyPrices,
    totalPrice: nightlyPrices.reduce((sum, nightlyPrice) => sum + nightlyPrice, 0),
  };
}

export function getRoomTypePricingValidationError(input: {
  base_occupancy: number;
  max_occupancy: number;
  occupancy_pricing: Record<string, OccupancyPriceLevel>;
  child_rule: 'age' | 'height';
  child_rule_limit: number | string | null;
  child_rates: ChildRateConfig;
}): string | null {
  if (!Number.isInteger(input.base_occupancy) || !Number.isInteger(input.max_occupancy)
    || input.base_occupancy < 1 || input.max_occupancy < input.base_occupancy) return 'Occupancy limits are invalid.';
  const configuredLevels = Object.keys(input.occupancy_pricing);
  if (configuredLevels.length !== input.max_occupancy
    || configuredLevels.some(level => !Number.isInteger(Number(level)) || Number(level) < 1 || Number(level) > input.max_occupancy)) {
    return 'Pricing must be configured exactly once for each guest count.';
  }
  for (let count = 1; count <= input.max_occupancy; count += 1) {
    const level = input.occupancy_pricing[String(count)];
    if (!level || typeof level.enabled !== 'boolean' || !['percent', 'fixed'].includes(level.mode)
      || !Number.isFinite(Number(level.value))) return `Pricing for ${count} guest(s) is required.`;
    const value = Number(level.value);
    if (level.enabled && ((count < input.base_occupancy && value >= 0) || (count > input.base_occupancy && value <= 0))) {
      return `Pricing adjustment for ${count} guest(s) has the wrong direction.`;
    }
    if (count === input.base_occupancy && (!level.enabled || level.mode !== 'percent' || value !== 0)) {
      return 'Base occupancy must use the normal room rate.';
    }
  }
  const rates = [input.child_rates.infant, input.child_rates.height, ...input.child_rates.age_groups];
  if (rates.some(rate => !rate || !['free', 'fixed', 'percent'].includes(rate.mode)
    || !Number.isFinite(Number(rate.value)) || Number(rate.value) < 0)) return 'Child rates are invalid.';
  const groups = input.child_rates.age_groups;
  if (groups.length > 3) return 'At most three child age groups are allowed.';
  if (groups.length > 0) {
    if (groups[0].min_age !== 3) return 'Child age groups must start at age 3.';
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      if (!Number.isInteger(group.min_age) || !Number.isInteger(group.max_age)
        || group.min_age < 3 || group.max_age > 17 || group.max_age < group.min_age) return 'Child age group limits are invalid.';
      if (index > 0 && group.min_age !== groups[index - 1].max_age + 1) return 'Child age groups must be contiguous.';
    }
  }
  if (input.child_rule === 'height' && (input.child_rule_limit == null || !Number.isFinite(Number(input.child_rule_limit)) || Number(input.child_rule_limit) < 0)) {
    return 'A child height limit is required.';
  }
  return null;
}
