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
