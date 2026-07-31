const USER_AGENT =
  process.env['EDGAR_USER_AGENT'] ?? 'OrbitEarningsDemo admin@orbitexample.com';

const SEC_TICKER_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_FACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts';

export interface EdgarActual {
  quarter: number;
  year: number;
  date: string;
  epsActual: number | null;
  revenueActual: number | null;
}

interface TickerMap {
  [idx: string]: { cik_str: string; ticker: string; title: string };
}

interface FactsResponse {
  cik: string;
  entityName: string;
  facts: {
    'us-gaap'?: Record<
      string,
      {
        units?: Record<
          string,
          Array<{ start: string; end: string; val: number; fy: number; fp: string; form: string; filed: string }>
        >
      }
    >;
  };
}

let tickerCache: { at: number; data: TickerMap } | null = null;

async function fetchTickerMap(): Promise<TickerMap> {
  if (tickerCache && Date.now() - tickerCache.at < 24 * 60 * 60 * 1000) {
    return tickerCache.data;
  }
  const res = await fetch(SEC_TICKER_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`SEC tickers request failed: ${res.status}`);
  const data = (await res.json()) as TickerMap;
  tickerCache = { at: Date.now(), data };
  return data;
}

export async function resolveCik(symbol: string): Promise<{ cik: string; name: string } | null> {
  const target = symbol.toUpperCase();
  const map = await fetchTickerMap();
  const entry = Object.values(map).find((t) => t.ticker.toUpperCase() === target);
  if (!entry) return null;
  return { cik: String(entry.cik_str).padStart(10, '0'), name: entry.title };
}

async function fetchFacts(cik: string): Promise<FactsResponse | null> {
  const res = await fetch(`${SEC_FACTS_URL}/CIK${cik}.json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SEC facts request failed: ${res.status}`);
  return (await res.json()) as FactsResponse;
}

const EPS_CONCEPTS = ['EarningsPerShareDiluted', 'EarningsPerShareBasic'];
const REVENUE_CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
];

interface FactRow {
  start: string;
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
}

function collectConcept(
  facts: FactsResponse['facts']['us-gaap'] | undefined,
  concepts: string[],
  targetFps: string[],
): FactRow[] {
  const rows: FactRow[] = [];
  if (!facts) return rows;
  for (const concept of concepts) {
    const node = facts[concept];
    if (!node?.units) continue;
    for (const unitValues of Object.values(node.units)) {
      for (const row of unitValues) {
        if (!targetFps.includes(row.fp)) continue;
        rows.push(row);
      }
    }
  }
  return rows;
}

const QUARTER_MS = 120 * 24 * 60 * 60 * 1000;

function dedupeByPeriod(rows: FactRow[]): FactRow[] {
  const best = new Map<string, FactRow>();
  for (const row of rows) {
    const key = `${row.fy}-${row.fp}`;
    const duration = new Date(row.end).getTime() - new Date(row.start).getTime();
    const existing = best.get(key);
    if (!existing) {
      best.set(key, row);
      continue;
    }
    const existingDuration = new Date(existing.end).getTime() - new Date(existing.start).getTime();
    if (duration < existingDuration) {
      best.set(key, row);
    } else if (duration === existingDuration && row.filed > existing.filed) {
      best.set(key, row);
    }
  }
  return Array.from(best.values())
    .filter((r) => new Date(r.end).getTime() - new Date(r.start).getTime() < QUARTER_MS)
    .sort((a, b) => b.fy - a.fy || b.fp.localeCompare(a.fp));
}

export async function getEdgarActuals(symbol: string): Promise<EdgarActual[] | null> {
  const resolved = await resolveCik(symbol);
  if (!resolved) return null;

  const facts = await fetchFacts(resolved.cik);
  if (!facts) return null;

  const quarterly = ['Q1', 'Q2', 'Q3', 'Q4'];
  const epsRows = dedupeByPeriod(collectConcept(facts.facts['us-gaap'], EPS_CONCEPTS, quarterly));
  const revenueRows = dedupeByPeriod(collectConcept(facts.facts['us-gaap'], REVENUE_CONCEPTS, quarterly));

  const revenueByPeriod = new Map(revenueRows.map((r) => [`${r.fy}-${r.fp}`, r.val]));

  const actuals: EdgarActual[] = epsRows
    .filter((r) => r.form === '10-Q' || r.form === '8-K')
    .map((r) => {
      const qNum = Number(r.fp.replace('Q', ''));
      return {
        quarter: qNum,
        year: r.fy,
        date: r.end,
        epsActual: r.val,
        revenueActual: revenueByPeriod.get(`${r.fy}-${r.fp}`) ?? null,
      };
    });

  if (actuals.length === 0) return null;
  return actuals;
}
