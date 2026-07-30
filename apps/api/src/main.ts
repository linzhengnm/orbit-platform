import express from 'express';
import { config } from './config.js';
import { searchSymbols, getCompanyProfile, getEarnings, getPeers, getFinancialsMetric } from './providers/finnhub.js';
import { earningsSeedData } from './data/earnings-data.js';
import type { Company, EarningsEvent, PeerSuggestion, ComparisonResult } from './types.js';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/search', async (req, res) => {
  const query = (req.query.q as string)?.trim();

  if (!query || query.length < 1) {
    res.json({ results: [] });
    return;
  }

  try {
    const results = await searchSymbols(query);

    if (results.length === 0) {
      const local = earningsSeedData
        .filter(
          (c) =>
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.symbol.toLowerCase().includes(query.toLowerCase())
        )
        .map((c) => ({
          symbol: c.symbol,
          name: c.name,
          sector: '',
          industry: '',
          marketCap: null,
          logo: null,
          exchange: null,
        }));

      res.json({ results: local, source: local.length > 0 ? 'seed' : 'finnhub' });
      return;
    }

    res.json({ results, source: 'finnhub' });
  } catch {
    const local = earningsSeedData
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.symbol.toLowerCase().includes(query.toLowerCase())
      )
      .map((c) => ({
        symbol: c.symbol,
        name: c.name,
        sector: '',
        industry: '',
        marketCap: null,
        logo: null,
        exchange: null,
      }));

    res.json({ results: local, source: 'seed' });
  }
});

app.get('/companies/:symbol/earnings', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    const finnhubData = await getEarnings(symbol);

    if (finnhubData.length > 0) {
      const metricData = await getFinancialsMetric(symbol);
      if (metricData?.series?.quarterly) {
        const quarters = metricData.series.quarterly;
        for (let i = 0; i < Math.min(finnhubData.length, quarters.length); i++) {
          finnhubData[i].revenueActual = quarters[i]?.v ?? null;
        }
      }

      res.json({ symbol, earnings: finnhubData, source: 'finnhub' });
      return;
    }

    const seed = earningsSeedData.find((c) => c.symbol === symbol);
    if (seed) {
      const earnings: EarningsEvent[] = [
        {
          symbol: seed.symbol,
          quarter: 1,
          year: 2025,
          date: seed.label,
          epsActual: seed.epsActual,
          epsEstimate: seed.epsEstimate,
          revenueActual: seed.revenueActual,
          revenueEstimate: seed.revenueEstimate,
          epsSurprisePct:
            seed.epsEstimate !== 0
              ? ((seed.epsActual - seed.epsEstimate) / Math.abs(seed.epsEstimate)) * 100
              : null,
          revenueSurprisePct:
            seed.revenueEstimate !== 0
              ? ((seed.revenueActual - seed.revenueEstimate) / Math.abs(seed.revenueEstimate)) * 100
              : null,
        },
      ];
      res.json({ symbol, earnings, source: 'seed' });
      return;
    }

    res.json({ symbol, earnings: [], source: 'none' });
  } catch {
    res.status(500).json({ error: 'Failed to fetch earnings data' });
  }
});

app.get('/companies/:symbol/peers', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    const finnhubPeers = await getPeers(symbol);

    if (finnhubPeers.length > 0) {
      res.json({ symbol, peers: finnhubPeers, source: 'finnhub' });
      return;
    }

    const seed = earningsSeedData.find((c) => c.symbol === symbol);
    if (seed) {
      const peers: PeerSuggestion[] = seed.peers.map((p) => ({
        symbol: p,
        name: null,
        sector: null,
        industry: null,
        marketCap: null,
      }));
      res.json({ symbol, peers, source: 'seed' });
      return;
    }

    res.json({ symbol, peers: [], source: 'none' });
  } catch {
    res.status(500).json({ error: 'Failed to fetch peers' });
  }
});

app.get('/compare', async (req, res) => {
  const symbolsParam = req.query.symbols as string;
  if (!symbolsParam) {
    res.status(400).json({ error: 'Missing symbols query parameter' });
    return;
  }

  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).slice(0, 5);
  if (symbols.length < 2) {
    res.status(400).json({ error: 'Provide at least 2 symbols separated by commas' });
    return;
  }

  try {
    const [symbolA, symbolB] = symbols;

    let companyA: Company | null = null;
    let companyB: Company | null = null;
    let earningsA: EarningsEvent[] = [];
    let earningsB: EarningsEvent[] = [];
    let peersA: PeerSuggestion[] = [];
    let peersB: PeerSuggestion[] = [];

    companyA = await getCompanyProfile(symbolA);
    companyB = await getCompanyProfile(symbolB);

    if (!companyA) {
      const seed = earningsSeedData.find((c) => c.symbol === symbolA);
      if (seed) {
        companyA = {
          symbol: seed.symbol,
          name: seed.name,
          sector: '',
          industry: '',
          marketCap: null,
          logo: null,
          exchange: null,
        };
      }
    }

    if (!companyB) {
      const seed = earningsSeedData.find((c) => c.symbol === symbolB);
      if (seed) {
        companyB = {
          symbol: seed.symbol,
          name: seed.name,
          sector: '',
          industry: '',
          marketCap: null,
          logo: null,
          exchange: null,
        };
      }
    }

    if (!companyA || !companyB) {
      res.status(404).json({ error: `Could not find data for ${!companyA ? symbolA : symbolB}` });
      return;
    }

    const finnhubEarningsA = await getEarnings(symbolA);
    const finnhubEarningsB = await getEarnings(symbolB);

    if (finnhubEarningsA.length > 0) {
      earningsA = finnhubEarningsA;
      const metricA = await getFinancialsMetric(symbolA);
      if (metricA?.series?.quarterly) {
        const quarters = metricA.series.quarterly;
        for (let i = 0; i < Math.min(earningsA.length, quarters.length); i++) {
          earningsA[i].revenueActual = quarters[i]?.v ?? null;
        }
      }
    } else {
      const seed = earningsSeedData.find((c) => c.symbol === symbolA);
      if (seed) {
        earningsA = [
          {
            symbol: seed.symbol,
            quarter: 1,
            year: 2025,
            date: seed.label,
            epsActual: seed.epsActual,
            epsEstimate: seed.epsEstimate,
            revenueActual: seed.revenueActual,
            revenueEstimate: seed.revenueEstimate,
            epsSurprisePct:
              seed.epsEstimate !== 0
                ? ((seed.epsActual - seed.epsEstimate) / Math.abs(seed.epsEstimate)) * 100
                : null,
            revenueSurprisePct:
              seed.revenueEstimate !== 0
                ? ((seed.revenueActual - seed.revenueEstimate) / Math.abs(seed.revenueEstimate)) * 100
                : null,
          },
        ];
      }
    }

    if (finnhubEarningsB.length > 0) {
      earningsB = finnhubEarningsB;
      const metricB = await getFinancialsMetric(symbolB);
      if (metricB?.series?.quarterly) {
        const quarters = metricB.series.quarterly;
        for (let i = 0; i < Math.min(earningsB.length, quarters.length); i++) {
          earningsB[i].revenueActual = quarters[i]?.v ?? null;
        }
      }
    } else {
      const seed = earningsSeedData.find((c) => c.symbol === symbolB);
      if (seed) {
        earningsB = [
          {
            symbol: seed.symbol,
            quarter: 1,
            year: 2025,
            date: seed.label,
            epsActual: seed.epsActual,
            epsEstimate: seed.epsEstimate,
            revenueActual: seed.revenueActual,
            revenueEstimate: seed.revenueEstimate,
            epsSurprisePct:
              seed.epsEstimate !== 0
                ? ((seed.epsActual - seed.epsEstimate) / Math.abs(seed.epsEstimate)) * 100
                : null,
            revenueSurprisePct:
              seed.revenueEstimate !== 0
                ? ((seed.revenueActual - seed.revenueEstimate) / Math.abs(seed.revenueEstimate)) * 100
                : null,
          },
        ];
      }
    }

    peersA = await getPeers(symbolA);
    peersB = await getPeers(symbolB);

    const result: ComparisonResult = {
      companyA,
      companyB,
      earningsA,
      earningsB,
      peersA,
      peersB,
    };

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to build comparison' });
  }
});

app.listen(config.port, config.host, () => {
  console.log(`[ ready ] http://${config.host}:${config.port}`);
  if (!config.finnhubApiKey) {
    console.log('[ info ] No FINNHUB_API_KEY set — using seed data fallback');
  }
});
