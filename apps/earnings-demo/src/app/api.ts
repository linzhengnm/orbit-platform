const API_BASE = 'http://localhost:3000';

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

export async function searchCompanies(query: string): Promise<Company[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function compareCompanies(a: string, b: string): Promise<ComparisonResult | null> {
  try {
    const res = await fetch(`${API_BASE}/compare?symbols=${a},${b}`);
    if (!res.ok) return null;
    return await res.json() as ComparisonResult;
  } catch {
    return null;
  }
}
