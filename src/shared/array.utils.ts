import { WRITE_BATCH_SIZE } from './consts/constants';

export function splitIntoBatches<T>(
  items: T[],
  batchSize = WRITE_BATCH_SIZE,
): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

export function uniqueBy<T, TKey>(items: T[], getKey: (item: T) => TKey): T[] {
  return [...new Map(items.map((item) => [getKey(item), item])).values()];
}
