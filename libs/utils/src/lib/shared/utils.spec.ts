import { buildEarningsView, sharedUtils } from './utils';

describe('sharedUtils', () => {
  it('should work', () => {
    expect(sharedUtils()).toEqual('shared/utils');
  });
});

describe('buildEarningsView', () => {
  it('calculates earnings deltas, percentages, and signals for each quarter', () => {
    const view = buildEarningsView([
      {
        label: 'Q1 2025',
        epsActual: 1.42,
        epsEstimate: 1.3,
        revenueActual: 95_000_000,
        revenueEstimate: 92_000_000,
        netIncome: 18_000_000,
      },
      {
        label: 'Q4 2024',
        epsActual: 1.18,
        epsEstimate: 1.2,
        revenueActual: 89_000_000,
        revenueEstimate: 90_000_000,
        netIncome: 16_500_000,
      },
    ]);

    expect(view).toHaveLength(2);
    expect(view[0]).toMatchObject({
      label: 'Q1 2025',
      signal: 'beat',
    });
    expect(view[0].epsDelta).toBeCloseTo(0.12, 12);
    expect(view[0].revenueDelta).toBeCloseTo(3_000_000, 12);
    expect(view[0].epsDeltaPct).toBeCloseTo(9.230769230769232, 12);
    expect(view[0].revenueDeltaPct).toBeCloseTo(3.260869565217391, 12);
    expect(view[0].netMarginPct).toBeCloseTo(18.94736842105263, 12);

    expect(view[1]).toMatchObject({
      label: 'Q4 2024',
      signal: 'miss',
    });
    expect(view[1].epsDelta).toBeCloseTo(-0.02, 12);
    expect(view[1].revenueDelta).toBeCloseTo(-1_000_000, 12);
    expect(view[1].epsDeltaPct).toBeCloseTo(-1.6666666666666667, 12);
    expect(view[1].revenueDeltaPct).toBeCloseTo(-1.1111111111111112, 12);
    expect(view[1].netMarginPct).toBeCloseTo(18.53932584269663, 12);
  });
});
