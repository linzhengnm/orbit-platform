export type SeedCompanySnapshot = {
  symbol: string;
  name: string;
  label: string;
  epsActual: number;
  epsEstimate: number;
  revenueActual: number;
  revenueEstimate: number;
  netIncome: number;
  peers: string[];
};

export const earningsSeedData: SeedCompanySnapshot[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    label: 'Q1 2025',
    epsActual: 1.42,
    epsEstimate: 1.3,
    revenueActual: 95_000_000_000,
    revenueEstimate: 92_000_000_000,
    netIncome: 18_000_000_000,
    peers: ['MSFT', 'NVDA', 'AMD', 'GOOGL', 'META'],
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    label: 'Q4 2024',
    epsActual: 1.18,
    epsEstimate: 1.2,
    revenueActual: 89_000_000_000,
    revenueEstimate: 90_000_000_000,
    netIncome: 16_500_000_000,
    peers: ['AAPL', 'GOOGL', 'ORCL', 'CRM', 'ADBE'],
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    label: 'Q1 2025',
    epsActual: 1.64,
    epsEstimate: 1.52,
    revenueActual: 115_000_000_000,
    revenueEstimate: 108_000_000_000,
    netIncome: 24_000_000_000,
    peers: ['AMD', 'AVGO', 'INTC', 'QCOM', 'MRVL'],
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    label: 'Q4 2024',
    epsActual: 1.89,
    epsEstimate: 1.82,
    revenueActual: 76_000_000_000,
    revenueEstimate: 73_500_000_000,
    netIncome: 14_500_000_000,
    peers: ['META', 'MSFT', 'AMZN', 'AAPL', 'CRM'],
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices, Inc.',
    label: 'Q1 2025',
    epsActual: 0.72,
    epsEstimate: 0.68,
    revenueActual: 7_500_000_000,
    revenueEstimate: 7_200_000_000,
    netIncome: 1_200_000_000,
    peers: ['NVDA', 'INTC', 'AVGO', 'QCOM', 'MRVL'],
  },
  {
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    label: 'Q4 2024',
    epsActual: 5.33,
    epsEstimate: 5.01,
    revenueActual: 48_000_000_000,
    revenueEstimate: 46_500_000_000,
    netIncome: 11_200_000_000,
    peers: ['GOOGL', 'MSFT', 'SNAP', 'PINS', 'TTD'],
  },
];
