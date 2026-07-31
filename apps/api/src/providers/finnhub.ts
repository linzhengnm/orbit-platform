import { config } from '../config.js';
import type { Company, EarningsEvent, PeerSuggestion } from '../types.js';

const BASE_URL = 'https://finnhub.io/api/v1';

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}token=${config.finnhubApiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface FinnhubSymbolResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
  primaryExchange: string;
}

interface FinnhubSymbolLookup {
  count: number;
  result: FinnhubSymbolResult[];
}

interface FinnhubCompanyProfile {
  country: string | null;
  currency: string | null;
  exchange: string | null;
  finnhubIndustry: string | null;
  ipo: string | null;
  marketCapitalization: number | null;
  name: string | null;
  phone: string | null;
  shareOutstanding: number | null;
  ticker: string | null;
  weburl: string | null;
  logo: string | null;
  sector: string | null;
}

interface FinnhubEarningEvent {
  actual: number | null;
  estimate: number | null;
  quarter: number;
  surprise: number | null;
  surprisePercent: number | null;
  symbol: string;
  year: number;
}

type FinnhubPeers = string[];

interface FinnhubFinancialsMetric {
  metric: Record<string, number | null>;
  series: {
    quarterly: Array<{
      period: string;
      v: number | null;
    }>;
  } | null;
}

export async function searchSymbols(query: string): Promise<Company[]> {
  if (!config.finnhubApiKey) return [];

  const data = await fetchJson<FinnhubSymbolLookup>(`/search?q=${encodeURIComponent(query)}`);

  const companies: Company[] = [];
  for (const result of data.result) {
    if (result.type === 'Common Stock') {
      let sector = '';
      let industry = '';
      let marketCap: number | null = null;
      let logo: string | null = null;
      let exchange: string | null = result.primaryExchange || null;

      try {
        const profile = await fetchJson<FinnhubCompanyProfile>(`/stock/profile2?symbol=${result.symbol}`);
        sector = profile.sector ?? '';
        industry = profile.finnhubIndustry ?? '';
        marketCap = profile.marketCapitalization;
        logo = profile.logo;
        exchange = profile.exchange || exchange;
      } catch {
        // profile fetch failed, use defaults
      }

      companies.push({
        symbol: result.symbol,
        name: result.description || result.displaySymbol,
        sector,
        industry,
        marketCap,
        logo,
        exchange,
      });
    }
  }

  return companies;
}

export async function getCompanyProfile(symbol: string): Promise<Company | null> {
  if (!config.finnhubApiKey) return null;

  try {
    const data = await fetchJson<FinnhubCompanyProfile>(`/stock/profile2?symbol=${symbol}`);
    if (!data.ticker) return null;

    return {
      symbol: data.ticker,
      name: data.name ?? symbol,
      sector: data.sector ?? '',
      industry: data.finnhubIndustry ?? '',
      marketCap: data.marketCapitalization,
      logo: data.logo,
      exchange: data.exchange ?? null,
    };
  } catch {
    return null;
  }
}

export async function getEarnings(symbol: string): Promise<EarningsEvent[]> {
  if (!config.finnhubApiKey) return [];

  try {
    const data = await fetchJson<FinnhubEarningEvent[]>(`/stock/earnings?symbol=${symbol}`);

    return data.map((e) => {
      const revenueActual: number | null = null;
      const revenueEstimate: number | null = null;
      const revenueSurprisePct: number | null = null;

      return {
        symbol: e.symbol,
        quarter: e.quarter,
        year: e.year,
        date: '',
        epsActual: e.actual,
        epsEstimate: e.estimate,
        revenueActual,
        revenueEstimate,
        epsSurprisePct: e.surprisePercent,
        revenueSurprisePct,
      };
    });
  } catch {
    return [];
  }
}

export async function getPeers(symbol: string): Promise<PeerSuggestion[]> {
  if (!config.finnhubApiKey) return [];

  try {
    const data = await fetchJson<FinnhubPeers>(`/stock/peers?symbol=${symbol}`);

    const peers: PeerSuggestion[] = [];
    for (const peerSymbol of data.slice(0, 8)) {
      let name: string | null = null;
      let sector: string | null = null;
      let industry: string | null = null;
      let marketCap: number | null = null;

      try {
        const profile = await fetchJson<FinnhubCompanyProfile>(`/stock/profile2?symbol=${peerSymbol}`);
        name = profile.name;
        sector = profile.sector;
        industry = profile.finnhubIndustry;
        marketCap = profile.marketCapitalization;
      } catch {
        // peer profile fetch failed
      }

      peers.push({ symbol: peerSymbol, name, sector, industry, marketCap });
    }

    return peers;
  } catch {
    return [];
  }
}

export async function getFinancialsMetric(symbol: string): Promise<FinnhubFinancialsMetric | null> {
  if (!config.finnhubApiKey) return null;

  try {
    return await fetchJson<FinnhubFinancialsMetric>(`/stock/financials?symbol=${symbol}&metric=all`);
  } catch {
    return null;
  }
}
