export type QuarterSnapshot = {
  label: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
  netIncome?: number | null;
};

export type EarningsView = {
  label: string;
  epsDelta: number | null;
  epsDeltaPct: number | null;
  revenueDelta: number | null;
  revenueDeltaPct: number | null;
  netMarginPct: number | null;
  signal: 'beat' | 'miss' | 'in-line' | 'unknown';
};

export function sharedUtils(): string {
  return 'shared/utils';
}

export function buildEarningsView(rows: QuarterSnapshot[]): EarningsView[] {
  return rows.map((row) => {
    const epsDelta =
      row.epsActual != null && row.epsEstimate != null
        ? row.epsActual - row.epsEstimate
        : null;

    const revenueDelta =
      row.revenueActual != null && row.revenueEstimate != null
        ? row.revenueActual - row.revenueEstimate
        : null;

    const epsDeltaPct =
      row.epsEstimate != null && row.epsEstimate !== 0 && epsDelta != null
        ? (epsDelta / row.epsEstimate) * 100
        : null;

    const revenueDeltaPct =
      row.revenueEstimate != null &&
      row.revenueEstimate !== 0 &&
      revenueDelta != null
        ? (revenueDelta / row.revenueEstimate) * 100
        : null;

    const netMarginPct =
      row.revenueActual != null && row.revenueActual !== 0 && row.netIncome != null
        ? (row.netIncome / row.revenueActual) * 100
        : null;

    let signal: EarningsView['signal'] = 'unknown';
    if (epsDelta != null) {
      if (epsDelta > 0.01) {
        signal = 'beat';
      } else if (epsDelta < -0.01) {
        signal = 'miss';
      } else {
        signal = 'in-line';
      }
    }

    return {
      label: row.label,
      epsDelta,
      epsDeltaPct,
      revenueDelta,
      revenueDeltaPct,
      netMarginPct,
      signal,
    };
  });
}
