const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY ?? '';

function finnhubUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${FINNHUB_BASE}${path}${sep}token=${API_KEY}`;
}

export interface Company {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  logo: string | null;
  exchange: string | null;
}

export interface EarningsEvent {
  symbol: string;
  quarter: number;
  year: number;
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  epsSurprisePct: number | null;
  revenueSurprisePct: number | null;
}

export interface PeerSuggestion {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
}

export interface ComparisonResult {
  companyA: Company;
  companyB: Company;
  earningsA: EarningsEvent[];
  earningsB: EarningsEvent[];
  peersA: PeerSuggestion[];
  peersB: PeerSuggestion[];
}

export interface CompanyMetrics {
  pe: number | null;
  roe: number | null;
  netMargin: number | null;
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  revenueGrowthYoy: number | null;
  epsGrowthYoy: number | null;
}

export interface Quote {
  price: number | null;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  prevClose: number | null;
}

export interface TickerQuote {
  symbol: string;
  price: number | null;
  changePct: number | null;
}

interface FinnhubSymbolResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

interface FinnhubSymbolLookup {
  count: number;
  result: FinnhubSymbolResult[];
}

interface FinnhubProfile {
  ticker: string;
  name: string;
  finnhubIndustry: string;
  marketCapitalization: number;
  logo: string;
  exchange: string;
  sector: string;
}

interface FinnhubEarning {
  actual: number | null;
  estimate: number | null;
  quarter: number;
  surprisePercent: number | null;
  symbol: string;
  year: number;
}

interface FinnhubQuote {
  c: number | null;
  d: number | null;
  dp: number | null;
  h: number | null;
  l: number | null;
  o: number | null;
  pc: number | null;
}

export async function searchCompanies(query: string): Promise<Company[]> {
  if (!query.trim()) return [];

  if (!API_KEY) return getSeedSearchResults(query);

  try {
    const res = await fetch(finnhubUrl(`/search?q=${encodeURIComponent(query.trim())}`));
    if (!res.ok) return [];
    const data: FinnhubSymbolLookup = await res.json();

    const companies: Company[] = [];
    for (const r of data.result) {
      if (r.type !== 'Common Stock') continue;
      try {
        const profileRes = await fetch(finnhubUrl(`/stock/profile2?symbol=${r.symbol}`));
        if (!profileRes.ok) {
          companies.push({ symbol: r.symbol, name: r.description, sector: '', industry: '', marketCap: null, logo: null, exchange: null });
          continue;
        }
        const p: FinnhubProfile = await profileRes.json();
        if (!p.ticker) {
          companies.push({ symbol: r.symbol, name: r.description, sector: '', industry: '', marketCap: null, logo: null, exchange: null });
          continue;
        }
        companies.push({
          symbol: p.ticker,
          name: p.name || r.description,
          sector: p.sector || '',
          industry: p.finnhubIndustry || '',
          marketCap: p.marketCapitalization || null,
          logo: p.logo || null,
          exchange: p.exchange || null,
        });
      } catch {
        companies.push({ symbol: r.symbol, name: r.description, sector: '', industry: '', marketCap: null, logo: null, exchange: null });
      }
    }

    return companies;
  } catch {
    return [];
  }
}

async function fetchProfile(symbol: string): Promise<Company | null> {
  try {
    const res = await fetch(finnhubUrl(`/stock/profile2?symbol=${symbol}`));
    if (!res.ok) return null;
    const p: FinnhubProfile = await res.json();
    if (!p.ticker) return null;
    return {
      symbol: p.ticker,
      name: p.name || symbol,
      sector: p.sector || '',
      industry: p.finnhubIndustry || '',
      marketCap: p.marketCapitalization ? p.marketCapitalization * 1_000_000 : null,
      logo: p.logo || null,
      exchange: p.exchange || null,
    };
  } catch {
    return null;
  }
}

async function fetchEarnings(symbol: string): Promise<EarningsEvent[]> {
  try {
    const res = await fetch(finnhubUrl(`/stock/earnings?symbol=${symbol}`));
    if (!res.ok) return [];
    const data: FinnhubEarning[] = await res.json();
    return data.map((e) => ({
      symbol: e.symbol,
      quarter: e.quarter,
      year: e.year,
      date: '',
      epsActual: e.actual,
      epsEstimate: e.estimate,
      revenueActual: null,
      revenueEstimate: null,
      epsSurprisePct: e.surprisePercent,
      revenueSurprisePct: null,
    }));
  } catch {
    return [];
  }
}

async function fetchPeers(symbol: string): Promise<PeerSuggestion[]> {
  try {
    const res = await fetch(finnhubUrl(`/stock/peers?symbol=${symbol}`));
    if (!res.ok) return [];
    const data: string[] = await res.json();
    const peers: PeerSuggestion[] = [];
    for (const s of data.slice(0, 8)) {
      try {
        const pRes = await fetch(finnhubUrl(`/stock/profile2?symbol=${s}`));
        if (pRes.ok) {
          const p: FinnhubProfile = await pRes.json();
          peers.push({ symbol: s, name: p.name || null, sector: p.sector || null, industry: p.finnhubIndustry || null, marketCap: p.marketCapitalization ? p.marketCapitalization * 1_000_000 : null });
        } else {
          peers.push({ symbol: s, name: null, sector: null, industry: null, marketCap: null });
        }
      } catch {
        peers.push({ symbol: s, name: null, sector: null, industry: null, marketCap: null });
      }
    }
    return peers;
  } catch {
    return [];
  }
}

async function fetchMetrics(symbol: string): Promise<CompanyMetrics | null> {
  try {
    const res = await fetch(finnhubUrl(`/stock/metric?symbol=${symbol}&metric=all`));
    if (!res.ok) return null;
    const data: { metric?: Record<string, number | null> } = await res.json();
    const m = data.metric ?? {};
    return {
      pe: m.peTTM ?? null,
      roe: m.roeTTM ?? null,
      netMargin: m.netProfitMarginTTM ?? null,
      dividendYield: m.dividendYieldIndicatedAnnual ?? null,
      week52High: m['52WeekHigh'] ?? null,
      week52Low: m['52WeekLow'] ?? null,
      beta: m.beta ?? null,
      revenueGrowthYoy: m.revenueGrowthTTMYoy ?? null,
      epsGrowthYoy: m.epsGrowthTTMYoy ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchQuote(symbol: string): Promise<Quote | null> {
  try {
    const res = await fetch(finnhubUrl(`/quote?symbol=${symbol}`));
    if (!res.ok) return null;
    const q: Partial<FinnhubQuote> = await res.json();
    if (q.c == null) return null;
    return {
      price: q.c, change: q.d ?? null, changePct: q.dp ?? null,
      high: q.h ?? null, low: q.l ?? null, open: q.o ?? null, prevClose: q.pc ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchTickerQuotes(symbols: string[]): Promise<TickerQuote[]> {
  if (!API_KEY) return [];
  const quotes = await Promise.all(symbols.map(async (symbol) => {
    const q = await fetchQuote(symbol);
    return { symbol, price: q?.price ?? null, changePct: q?.changePct ?? null };
  }));
  return quotes.filter((q) => q.price != null);
}

export async function compareCompanies(a: string, b: string): Promise<ComparisonResult | null> {
  if (!API_KEY) return null;

  try {
    const [companyA, companyB, earningsA, earningsB, peersA, peersB] = await Promise.all([
      fetchProfile(a),
      fetchProfile(b),
      fetchEarnings(a),
      fetchEarnings(b),
      fetchPeers(a),
      fetchPeers(b),
    ]);

    if (!companyA || !companyB) return null;

    return { companyA, companyB, earningsA, earningsB, peersA, peersB };
  } catch {
    return null;
  }
}

export interface CompanyDetail {
  company: Company;
  earnings: EarningsEvent[];
  peers: PeerSuggestion[];
  metrics: CompanyMetrics | null;
  quote: Quote | null;
}

export async function fetchCompanyEarnings(symbol: string): Promise<CompanyDetail | null> {
  if (!API_KEY) return getSeedDetail(symbol);

  try {
    const [company, earnings, peers, metrics, quote] = await Promise.all([
      fetchProfile(symbol),
      fetchEarnings(symbol),
      fetchPeers(symbol),
      fetchMetrics(symbol),
      fetchQuote(symbol),
    ]);

    if (!company) return getSeedDetail(symbol);
    return { company, earnings, peers, metrics, quote };
  } catch {
    return getSeedDetail(symbol);
  }
}

/* ── seed data fallback ── */

interface SeedEntry {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  marketCap: number | null;
  quarters: Array<{ label: string; epsActual: number; epsEstimate: number; revenueActual: number | null }>;
  peers: string[];
}

const seedData: SeedEntry[] = [
  {
    symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics', exchange: 'NASDAQ',
    marketCap: 3_500_000_000_000,
    quarters: [
      { label: 'Q1 2025', epsActual: 1.42, epsEstimate: 1.30, revenueActual: 95_000_000_000 },
      { label: 'Q4 2024', epsActual: 1.28, epsEstimate: 1.21, revenueActual: 91_000_000_000 },
      { label: 'Q3 2024', epsActual: 1.35, epsEstimate: 1.31, revenueActual: 93_000_000_000 },
      { label: 'Q2 2024', epsActual: 1.18, epsEstimate: 1.14, revenueActual: 88_000_000_000 },
      { label: 'Q1 2024', epsActual: 1.52, epsEstimate: 1.48, revenueActual: 97_000_000_000 },
    ],
    peers: ['MSFT', 'NVDA', 'AMD', 'GOOGL', 'META'],
  },
  {
    symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software—Infrastructure', exchange: 'NASDAQ',
    marketCap: 3_200_000_000_000,
    quarters: [
      { label: 'Q4 2024', epsActual: 1.18, epsEstimate: 1.20, revenueActual: 89_000_000_000 },
      { label: 'Q3 2024', epsActual: 1.12, epsEstimate: 1.08, revenueActual: 86_000_000_000 },
      { label: 'Q2 2024', epsActual: 1.04, epsEstimate: 0.99, revenueActual: 82_000_000_000 },
      { label: 'Q1 2024', epsActual: 1.25, epsEstimate: 1.22, revenueActual: 90_000_000_000 },
      { label: 'Q4 2023', epsActual: 1.06, epsEstimate: 1.02, revenueActual: 84_000_000_000 },
    ],
    peers: ['AAPL', 'GOOGL', 'ORCL', 'CRM', 'ADBE'],
  },
  {
    symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors', exchange: 'NASDAQ',
    marketCap: 3_800_000_000_000,
    quarters: [
      { label: 'Q1 2025', epsActual: 1.64, epsEstimate: 1.52, revenueActual: 115_000_000_000 },
      { label: 'Q4 2024', epsActual: 1.55, epsEstimate: 1.48, revenueActual: 110_000_000_000 },
      { label: 'Q3 2024', epsActual: 1.42, epsEstimate: 1.35, revenueActual: 105_000_000_000 },
      { label: 'Q2 2024', epsActual: 1.30, epsEstimate: 1.22, revenueActual: 98_000_000_000 },
      { label: 'Q1 2024', epsActual: 1.72, epsEstimate: 1.65, revenueActual: 120_000_000_000 },
    ],
    peers: ['AMD', 'AVGO', 'INTC', 'QCOM', 'MRVL'],
  },
  {
    symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', industry: 'Internet Content & Information', exchange: 'NASDAQ',
    marketCap: 2_400_000_000_000,
    quarters: [
      { label: 'Q4 2024', epsActual: 1.89, epsEstimate: 1.82, revenueActual: 76_000_000_000 },
      { label: 'Q3 2024', epsActual: 1.78, epsEstimate: 1.72, revenueActual: 72_000_000_000 },
      { label: 'Q2 2024', epsActual: 1.65, epsEstimate: 1.60, revenueActual: 68_000_000_000 },
      { label: 'Q1 2024', epsActual: 1.95, epsEstimate: 1.88, revenueActual: 78_000_000_000 },
    ],
    peers: ['META', 'MSFT', 'AMZN', 'AAPL', 'CRM'],
  },
  {
    symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', sector: 'Technology', industry: 'Semiconductors', exchange: 'NASDAQ',
    marketCap: 280_000_000_000,
    quarters: [
      { label: 'Q1 2025', epsActual: 0.72, epsEstimate: 0.68, revenueActual: 7_500_000_000 },
      { label: 'Q4 2024', epsActual: 0.65, epsEstimate: 0.62, revenueActual: 6_800_000_000 },
      { label: 'Q3 2024', epsActual: 0.58, epsEstimate: 0.55, revenueActual: 6_200_000_000 },
      { label: 'Q2 2024', epsActual: 0.50, epsEstimate: 0.47, revenueActual: 5_700_000_000 },
    ],
    peers: ['NVDA', 'INTC', 'AVGO', 'QCOM', 'MRVL'],
  },
  {
    symbol: 'META', name: 'Meta Platforms, Inc.', sector: 'Technology', industry: 'Social Media', exchange: 'NASDAQ',
    marketCap: 1_800_000_000_000,
    quarters: [
      { label: 'Q4 2024', epsActual: 5.33, epsEstimate: 5.01, revenueActual: 48_000_000_000 },
      { label: 'Q3 2024', epsActual: 4.98, epsEstimate: 4.75, revenueActual: 45_000_000_000 },
      { label: 'Q2 2024', epsActual: 4.65, epsEstimate: 4.42, revenueActual: 42_000_000_000 },
      { label: 'Q1 2024', epsActual: 5.60, epsEstimate: 5.35, revenueActual: 50_000_000_000 },
    ],
    peers: ['GOOGL', 'MSFT', 'SNAP', 'PINS', 'TTD'],
  },
];

const seedMetrics: Record<string, CompanyMetrics> = {
  AAPL: { pe: 40.2, roe: 147, netMargin: 27.2, dividendYield: 0.32, week52High: 344.6, week52Low: 201.5, beta: 1.08, revenueGrowthYoy: 12.8, epsGrowthYoy: 29.0 },
  MSFT: { pe: 38.4, roe: 40.1, netMargin: 36.5, dividendYield: 0.7, week52High: 468.2, week52Low: 402.4, beta: 0.9, revenueGrowthYoy: 17.2, epsGrowthYoy: 24.6 },
  NVDA: { pe: 52.6, roe: 110.4, netMargin: 55.8, dividendYield: 0.03, week52High: 175.3, week52Low: 92.4, beta: 1.68, revenueGrowthYoy: 82.4, epsGrowthYoy: 110.2 },
  GOOGL: { pe: 27.1, roe: 32.6, netMargin: 30.1, dividendYield: 0.42, week52High: 205.6, week52Low: 148.2, beta: 1.05, revenueGrowthYoy: 14.8, epsGrowthYoy: 28.3 },
  AMD: { pe: 45.8, roe: 15.2, netMargin: 12.4, dividendYield: 0.0, week52High: 178.4, week52Low: 98.2, beta: 1.61, revenueGrowthYoy: 22.5, epsGrowthYoy: 18.4 },
  META: { pe: 30.4, roe: 34.8, netMargin: 34.2, dividendYield: 0.38, week52High: 635.2, week52Low: 472.6, beta: 1.23, revenueGrowthYoy: 19.4, epsGrowthYoy: 26.1 },
};

function seedToCompany(s: SeedEntry): Company {
  return { symbol: s.symbol, name: s.name, sector: s.sector, industry: s.industry, marketCap: s.marketCap, logo: null, exchange: s.exchange };
}

function seedToEarnings(s: SeedEntry): EarningsEvent[] {
  return s.quarters.map((q) => {
    const parts = q.label.split(' ');
    const qNum = Number(parts[0]?.replace('Q', ''));
    const year = Number(parts[1]);
    const epsSurprisePct = q.epsEstimate !== 0 ? ((q.epsActual - q.epsEstimate) / Math.abs(q.epsEstimate)) * 100 : null;
    return {
      symbol: s.symbol, quarter: qNum, year, date: q.label,
      epsActual: q.epsActual, epsEstimate: q.epsEstimate,
      revenueActual: q.revenueActual, revenueEstimate: null,
      epsSurprisePct, revenueSurprisePct: null,
    };
  });
}

function seedToPeers(s: SeedEntry): PeerSuggestion[] {
  return s.peers.map((p) => {
    const found = seedData.find((x) => x.symbol === p);
    return { symbol: p, name: found?.name ?? null, sector: found?.sector ?? null, industry: found?.industry ?? null, marketCap: found?.marketCap ?? null };
  });
}

function getSeedDetail(symbol: string): CompanyDetail | null {
  const s = seedData.find((x) => x.symbol === symbol.toUpperCase());
  if (!s) return null;
  return {
    company: seedToCompany(s),
    earnings: seedToEarnings(s),
    peers: seedToPeers(s),
    metrics: seedMetrics[s.symbol] ?? null,
    quote: null,
  };
}

export function getSeedSearchResults(query: string): Company[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return seedData
    .filter((s) => s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q))
    .map(seedToCompany);
}
