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

export async function searchCompanies(query: string): Promise<Company[]> {
  if (!query.trim() || !API_KEY) return [];

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
      marketCap: p.marketCapitalization || null,
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
          peers.push({ symbol: s, name: p.name || null, sector: p.sector || null, industry: p.finnhubIndustry || null, marketCap: p.marketCapitalization || null });
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
}

export async function fetchCompanyEarnings(symbol: string): Promise<CompanyDetail | null> {
  if (!API_KEY) return null;

  try {
    const [company, earnings, peers] = await Promise.all([
      fetchProfile(symbol),
      fetchEarnings(symbol),
      fetchPeers(symbol),
    ]);

    if (!company) return null;
    return { company, earnings, peers };
  } catch {
    return null;
  }
}
