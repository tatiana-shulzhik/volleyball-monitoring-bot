export interface IMapSettledWithConcurrencyParams<TInput, TOutput> {
  items: readonly TInput[];
  mapper: (item: TInput) => Promise<TOutput>;
  concurrency: number;
}

export async function mapSettledWithConcurrency<TInput, TOutput>(
  data: IMapSettledWithConcurrencyParams<TInput, TOutput>,
): Promise<PromiseSettledResult<TOutput>[]> {
  const { items, mapper, concurrency } = data;
  const results = new Array<PromiseSettledResult<TOutput>>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;

      try {
        results[index] = {
          status: 'fulfilled',
          value: await mapper(items[index]),
        };
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
}
