export interface LevelQuantity {
  locationId: string;
  available: number;
}

export interface RestockInput {
  /** Location the webhook fired for. */
  eventLocationId: string | null;
  /** Locations the merchant ticked. Empty = every location counts. */
  enabledLocationIds: string[];
  levels: LevelQuantity[];
  threshold: number;
}

/** Stock summed over the locations that may trigger alerts. */
export function countedStock(levels: LevelQuantity[], enabledLocationIds: string[]): number {
  const counted = enabledLocationIds.length
    ? levels.filter((l) => enabledLocationIds.includes(l.locationId))
    : levels;
  return counted.reduce((sum, l) => sum + Math.max(0, l.available), 0);
}

/**
 * Whether a stock change should send the restock emails. A change at a location the merchant did not
 * tick is ignored, and the stock that has to reach the threshold is the total over the ticked
 * locations, not the single level that changed.
 */
export function shouldNotify(input: RestockInput): boolean {
  if (
    input.enabledLocationIds.length &&
    input.eventLocationId &&
    !input.enabledLocationIds.includes(input.eventLocationId)
  ) {
    return false;
  }
  return countedStock(input.levels, input.enabledLocationIds) >= Math.max(1, input.threshold);
}

/** Minutes to wait before attempt number `attempts` is retried (1, 2, 4, 8, 16). */
export function retryDelayMinutes(attempts: number): number {
  return 2 ** Math.max(0, attempts - 1);
}

export const MAX_ATTEMPTS = 5;
