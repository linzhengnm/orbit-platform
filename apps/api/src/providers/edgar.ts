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
  capexActual: number | null;
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
const CAPEX_CONCEPTS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets',
  'PaymentsToAcquireProductiveAssets',
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

interface PeriodValues {
  standalone: FactRow | null;
  cumulative: FactRow | null;
}

function rowDuration(row: FactRow): number {
  return new Date(row.end).getTime() - new Date(row.start).getTime();
}

function buildPeriodValues(rows: FactRow[]): Map<string, PeriodValues> {
  const byEnd = new Map<string, PeriodValues>();
  for (const row of rows) {
    const cur = byEnd.get(row.end) ?? { standalone: null, cumulative: null };
    if (!cur.standalone || rowDuration(row) < rowDuration(cur.standalone)) cur.standalone = row;
    if (!cur.cumulative || rowDuration(row) > rowDuration(cur.cumulative)) cur.cumulative = row;
    byEnd.set(row.end, cur);
  }
  return byEnd;
}

function deriveStandaloneFromCumulative(rows: FactRow[]): Map<string, number> {
  const best = new Map<string, FactRow>();
  for (const row of rows) {
    const cur = best.get(row.end);
    if (!cur || rowDuration(row) > rowDuration(cur)) best.set(row.end, row);
  }
  const byYear = new Map<string, FactRow[]>();
  for (const row of best.values()) {
    const list = byYear.get(row.start) ?? [];
    list.push(row);
    byYear.set(row.start, list);
  }
  const result = new Map<string, number>();
  for (const list of byYear.values()) {
    const sorted = list.sort((a, b) => a.end.localeCompare(b.end));
    for (let i = 0; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      result.set(sorted[i].end, prev ? Math.abs(sorted[i].val - prev.val) : Math.abs(sorted[i].val));
    }
  }
  return result;
}

function finalQuarterlyValues(rows: FactRow[]): Map<string, number> {
  const vals = buildPeriodValues(rows);
  const result = new Map<string, number>();
  for (const [end, v] of vals) {
    if (v.standalone && rowDuration(v.standalone) < QUARTER_MS) {
      result.set(end, v.standalone.val);
    }
  }
  for (const [end, v] of deriveStandaloneFromCumulative(rows)) {
    if (!result.has(end)) result.set(end, v);
  }
  return result;
}

export async function getEdgarActuals(symbol: string): Promise<EdgarActual[] | null> {
  const resolved = await resolveCik(symbol);
  if (!resolved) return null;

  const facts = await fetchFacts(resolved.cik);
  if (!facts) return null;

  const allFps = ['Q1', 'Q2', 'Q3', 'Q4', 'FY'];
  const epsRows = collectConcept(facts.facts['us-gaap'], EPS_CONCEPTS, allFps);
  const revenueRows = collectConcept(facts.facts['us-gaap'], REVENUE_CONCEPTS, allFps);
  const capexRows = collectConcept(facts.facts['us-gaap'], CAPEX_CONCEPTS, allFps);

  const epsByEnd = finalQuarterlyValues(epsRows);
  const revenueByEnd = finalQuarterlyValues(revenueRows);
  const capexByEnd = finalQuarterlyValues(capexRows);

  const actuals: EdgarActual[] = Array.from(epsByEnd.entries())
    .map(([end, epsActual]) => {
      const labelRow = epsRows
        .filter((r) => r.end === end)
        .sort((a, b) => Number(a.fp === 'FY') - Number(b.fp === 'FY'))[0];
      const quarter = labelRow?.fp === 'FY' ? 4 : labelRow ? Number(labelRow.fp.replace('Q', '')) : 0;
      return {
        quarter,
        year: labelRow?.fy ?? 0,
        date: end,
        epsActual,
        revenueActual: revenueByEnd.get(end) ?? null,
        capexActual: capexByEnd.get(end) ?? null,
      };
    })
    .filter((a) => a.quarter > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (actuals.length === 0) return null;
  return actuals;
}
