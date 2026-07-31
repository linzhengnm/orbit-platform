import { useCallback, useEffect, useRef, useState } from 'react';
import {
  searchCompanies,
  fetchCompanyEarnings,
  fetchTickerQuotes,
} from './api';
import type { Company, CompanyDetail, CompanyMetrics, EarningsEvent, PeerSuggestion, Quote, TickerQuote } from './api';
import styles from './app.module.css';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ── formatting helpers ── */

function formatLarge(num: number | null | undefined, digits = 2): string {
  if (num == null) return '—';
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(digits)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(digits)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(digits)}M`;
  return `$${num.toFixed(2)}`;
}

function formatMarketCap(v: number | null): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function qoqGrowth(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function yoyGrowth(current: EarningsEvent | null, previous: EarningsEvent | null): number | null {
  if (!current || !previous) return null;
  return qoqGrowth(current.epsActual, previous.epsActual);
}

function sortDesc(earnings: EarningsEvent[]): EarningsEvent[] {
  return [...earnings].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
}

/* ── earnings score + verdict ── */

function earningsScore(earnings: EarningsEvent[]): { grade: string; value: number } {
  if (earnings.length === 0) return { grade: '—', value: 0 };
  const rated = earnings.filter((e) => e.epsActual != null && e.epsEstimate != null);
  if (rated.length === 0) return { grade: '—', value: 0 };

  const beatRate = (rated.filter((e) => e.epsActual! > e.epsEstimate!).length / rated.length) * 100;

  const surprises = rated.map((e) => e.epsSurprisePct ?? 0);
  const avgSurprise = surprises.reduce((a, b) => a + b, 0) / surprises.length;
  const surpriseNorm = Math.max(0, Math.min(100, (avgSurprise + 20) / 0.8));

  const sorted = sortDesc(earnings);
  let upCount = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i].epsActual;
    const prev = sorted[i + 1].epsActual;
    if (cur != null && prev != null && cur > prev) upCount++;
  }
  const consistency = sorted.length > 1 ? (upCount / (sorted.length - 1)) * 100 : 50;

  const value = beatRate * 0.4 + surpriseNorm * 0.3 + consistency * 0.3;
  const grade = value >= 85 ? 'A' : value >= 70 ? 'B' : value >= 55 ? 'C' : value >= 40 ? 'D' : 'F';
  return { grade, value: Math.round(value) };
}

function buildVerdict(detail: CompanyDetail): string {
  const { company, earnings } = detail;
  const rated = earnings.filter((e) => e.epsActual != null && e.epsEstimate != null);
  if (rated.length === 0) return `${company.name} has limited earnings history to analyze.`;

  const beats = rated.filter((e) => e.epsActual! > e.epsEstimate!).length;
  const misses = rated.length - beats;
  const latest = sortDesc(earnings)[0];

  let msg = `${company.name} beat analyst expectations in ${beats} of the last ${rated.length} quarters`;
  if (misses > 0) msg += ` and missed ${misses}`;
  msg += '.';
  if (latest?.epsSurprisePct != null) {
    msg += ` Last quarter surprised by ${pct(latest.epsSurprisePct)}.`;
  }
  return msg;
}

/* ── presentational components ── */

function TickerTape({ quotes }: { quotes: TickerQuote[] }) {
  if (quotes.length === 0) return null;
  const doubled = [...quotes, ...quotes];
  return (
    <div className={styles.tickerWrap}>
      <div className={styles.tickerTrack}>
        {doubled.map((q, i) => (
          <span key={`${q.symbol}-${i}`} className={styles.tickerItem}>
            <span className={styles.tickerSymbol}>{q.symbol}</span>
            <span className={styles.tickerPrice}>{q.price?.toFixed(2)}</span>
            <span className={(q.changePct ?? 0) >= 0 ? styles.toneUp : styles.toneDown}>{pct(q.changePct)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SearchDropdown({
  query, results, loading, onSelect,
}: {
  query: string; results: Company[]; loading: boolean; onSelect: (c: Company) => void;
}) {
  if (!query.trim() || results.length === 0) return null;
  return (
    <ul className={styles.dropdown}>
      {loading ? (
        <li className={styles.dropdownItem}>
          <span className={styles.dropdownMeta}>SEARCHING…</span>
        </li>
      ) : (
        results.map((c) => (
          <li key={c.symbol} className={styles.dropdownItem} onClick={() => onSelect(c)}>
            <span className={styles.dropdownSymbol}>{c.symbol}</span>
            <span className={styles.dropdownName}>{c.name}</span>
            {c.exchange && <span className={styles.dropdownMeta}>{c.exchange}</span>}
          </li>
        ))
      )}
    </ul>
  );
}

function CompanyProfile({ company, quote }: { company: Company; quote: Quote | null }) {
  const priceUp = (quote?.changePct ?? 0) >= 0;
  return (
    <div className={styles.profile}>
      <div className={styles.profileInfo}>
        {company.logo ? (
          <img src={company.logo} alt="" className={styles.logo} />
        ) : (
          <div className={styles.logoFallback}>{company.symbol.slice(0, 2)}</div>
        )}
        <div>
          <h2 className={styles.profileName}>{company.name}</h2>
          <div className={styles.profileMeta}>
            <span className={styles.profileSymbol}>{company.symbol}</span>
            {company.exchange && <span>{company.exchange}</span>}
            {company.sector && <span>{company.sector}</span>}
            {company.industry && <span>{company.industry}</span>}
            {company.marketCap != null && <span>MCap {formatMarketCap(company.marketCap)}</span>}
          </div>
        </div>
      </div>
      {quote?.price != null && (
        <div className={styles.quoteBlock}>
          <span className={`${styles.quotePrice} ${priceUp ? styles.toneUp : styles.toneDown}`}>
            ${quote.price.toFixed(2)}
          </span>
          <span className={`${styles.quoteChange} ${priceUp ? styles.toneUp : styles.toneDown}`}>
            {priceUp ? '▲' : '▼'} {pct(quote.changePct)}
          </span>
        </div>
      )}
    </div>
  );
}

function VerdictBanner({ verdict, grade, score }: { verdict: string; grade: string; score: number }) {
  return (
    <div className={styles.verdict}>
      <div className={`${styles.gradeBadge} ${styles[`grade${grade}`]}`}>
        {grade}
      </div>
      <div>
        <p className={styles.verdictText}>{verdict}</p>
        <p className={styles.verdictScore}>EARNINGS SCORE {score}/100</p>
      </div>
    </div>
  );
}

function Sparkline({ earnings }: { earnings: EarningsEvent[] }) {
  const data = [...earnings].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const vals = data.map((e) => e.epsActual).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const w = 320, h = 72, pad = 8;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const rising = vals[vals.length - 1] >= vals[0];
  const color = rising ? '#22c55e' : '#f43f5e';
  const last = pts[pts.length - 1];
  const area = `${path} L${last[0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
  return (
    <div className={styles.sparkWrap}>
      <svg viewBox={`0 0 ${w} ${h}`} className={styles.sparkline} role="img" aria-label="EPS trend">
        <path d={area} fill={color} opacity="0.08" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={color} />
        ))}
        {last && <circle cx={last[0]} cy={last[1]} r="4" fill={color} stroke="#0a0e14" strokeWidth="2" />}
      </svg>
      <div className={styles.sparkLabels}>
        <span>{`Q${data[0].quarter} ${data[0].year}`}</span>
        <span>{`Q${data[data.length - 1].quarter} ${data[data.length - 1].year}`}</span>
      </div>
    </div>
  );
}

function BeatStrip({ earnings }: { earnings: EarningsEvent[] }) {
  const sorted = sortDesc(earnings);
  return (
    <div className={styles.beatStrip}>
      {sorted.map((e) => {
        const beat = e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate;
        const miss = e.epsActual != null && e.epsEstimate != null && e.epsActual < e.epsEstimate;
        return (
          <span
            key={`${e.year}q${e.quarter}`}
            className={beat ? styles.beatDotUp : miss ? styles.beatDotDown : styles.beatDotFlat}
            title={`Q${e.quarter} ${e.year}: ${beat ? 'beat' : miss ? 'missed' : 'in-line'}`}
          />
        );
      })}
    </div>
  );
}

function CompanyStats({ metrics, quote }: { metrics: CompanyMetrics | null; quote: Quote | null }) {
  if (!metrics) return null;
  const items: Array<{ label: string; value: string; tone?: 'up' | 'down' }> = [];

  if (quote?.price != null) {
    items.push({ label: 'Price', value: `$${quote.price.toFixed(2)}`, tone: (quote.changePct ?? 0) >= 0 ? 'up' : 'down' });
    if (quote.changePct != null) items.push({ label: 'Day Change', value: pct(quote.changePct), tone: quote.changePct >= 0 ? 'up' : 'down' });
  }
  if (metrics.pe != null) items.push({ label: 'P/E Ratio', value: metrics.pe.toFixed(1) });
  if (metrics.roe != null) items.push({ label: 'ROE', value: `${metrics.roe.toFixed(1)}%` });
  if (metrics.netMargin != null) items.push({ label: 'Net Margin', value: `${metrics.netMargin.toFixed(1)}%` });
  if (metrics.dividendYield != null && metrics.dividendYield > 0) items.push({ label: 'Div Yield', value: `${metrics.dividendYield.toFixed(2)}%` });
  if (metrics.revenueGrowthYoy != null) items.push({ label: 'Rev Growth YoY', value: pct(metrics.revenueGrowthYoy), tone: metrics.revenueGrowthYoy >= 0 ? 'up' : 'down' });
  if (metrics.epsGrowthYoy != null) items.push({ label: 'EPS Growth YoY', value: pct(metrics.epsGrowthYoy), tone: metrics.epsGrowthYoy >= 0 ? 'up' : 'down' });
  if (metrics.week52High != null && metrics.week52Low != null) {
    items.push({ label: '52-Week Range', value: `${metrics.week52Low.toFixed(0)} – ${metrics.week52High.toFixed(0)}` });
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Company Stats</h2>
      <div className={styles.statsGrid}>
        {items.map((it) => (
          <div key={it.label} className={styles.statCard}>
            <span className={styles.statLabel}>{it.label}</span>
            <span className={`${styles.statValue} ${it.tone === 'up' ? styles.toneUp : it.tone === 'down' ? styles.toneDown : ''}`}>
              {it.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuarterTable({ earnings }: { earnings: EarningsEvent[] }) {
  if (earnings.length === 0) return null;
  const sorted = sortDesc(earnings);
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Quarterly Earnings</h2>
      <BeatStrip earnings={earnings} />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Quarter</th>
              <th>EPS Actual</th>
              <th>EPS Estimate</th>
              <th>Surprise %</th>
              <th>Revenue</th>
              <th>Beat/Miss</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => {
              const next = sorted[i + 1] ?? null;
              const epsGrowth = qoqGrowth(e.epsActual, next?.epsActual ?? null);
              const isBeat = e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate;
              const isMiss = e.epsActual != null && e.epsEstimate != null && e.epsActual < e.epsEstimate;
              return (
                <tr key={`${e.year}q${e.quarter}`}>
                  <td className={styles.quarterLabel}>Q{e.quarter} {e.year}</td>
                  <td className={styles.epsCell}>
                    <span>{e.epsActual != null ? e.epsActual.toFixed(2) : '—'}</span>
                    {epsGrowth != null && (
                      <span className={epsGrowth >= 0 ? styles.trendUp : styles.trendDown}>
                        {epsGrowth >= 0 ? '▲' : '▼'} {Math.abs(epsGrowth).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td>{e.epsEstimate != null ? e.epsEstimate.toFixed(2) : '—'}</td>
                  <td>
                    {e.epsSurprisePct != null ? (
                      <span className={e.epsSurprisePct >= 0 ? styles.surpriseBeat : styles.surpriseMiss}>
                        {pct(e.epsSurprisePct)}
                      </span>
                    ) : '—'}
                  </td>
                  <td>{formatLarge(e.revenueActual)}</td>
                  <td>
                    {isBeat && <span className={styles.badgeBeat}>BEAT</span>}
                    {isMiss && <span className={styles.badgeMiss}>MISS</span>}
                    {!isBeat && !isMiss && <span className={styles.badgeNeutral}>IN-LINE</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrendBar({ earnings }: { earnings: EarningsEvent[] }) {
  if (earnings.length < 2) return null;
  const sorted = sortDesc(earnings);
  const latest = sorted[0];
  const prev = sorted[1];
  const epsQoQ = qoqGrowth(latest?.epsActual, prev?.epsActual);
  const sameQuarterLastYear = sorted.find((e) => e.quarter === latest?.quarter && e.year === latest?.year - 1);
  const epsYoY = yoyGrowth(latest, sameQuarterLastYear ?? null);

  const avgSurprise = earnings.reduce((sum, e) => sum + (e.epsSurprisePct ?? 0), 0) / earnings.length;
  const beats = earnings.filter((e) => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate).length;
  const misses = earnings.filter((e) => e.epsActual != null && e.epsEstimate != null && e.epsActual < e.epsEstimate).length;

  const items: Array<{ label: string; value: string; tone: 'up' | 'down' | 'flat' }> = [
    { label: 'Avg Surprise', value: pct(avgSurprise), tone: avgSurprise >= 0 ? 'up' : 'down' },
    { label: 'Beat/Miss', value: `${beats}-${misses}`, tone: beats >= misses ? 'up' : 'down' },
    { label: 'EPS QoQ', value: epsQoQ != null ? pct(epsQoQ) : '—', tone: epsQoQ != null ? (epsQoQ >= 0 ? 'up' : 'down') : 'flat' },
    { label: 'EPS YoY', value: epsYoY != null ? pct(epsYoY) : '—', tone: epsYoY != null ? (epsYoY >= 0 ? 'up' : 'down') : 'flat' },
    { label: 'Total Quarters', value: String(earnings.length), tone: 'flat' },
  ];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Trends</h2>
      <div className={styles.trendGrid}>
        {items.map((item) => (
          <div key={item.label} className={styles.trendCard}>
            <span className={styles.trendLabel}>{item.label}</span>
            <span className={`${styles.trendValue} ${item.tone === 'up' ? styles.toneUp : item.tone === 'down' ? styles.toneDown : ''}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PeerSuggestions({ peers }: { peers: PeerSuggestion[] }) {
  if (peers.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Peer Companies</h2>
      <div className={styles.peerChips}>
        {peers.map((p) => (
          <span key={p.symbol} className={styles.peerChip}>
            <strong>{p.symbol}</strong>
            {p.name && <span className={styles.peerName}>{p.name}</span>}
          </span>
        ))}
      </div>
    </section>
  );
}

function SingleView({ detail, loading }: { detail: CompanyDetail | null; loading: boolean }) {
  if (loading) return <p className={styles.loading}>LOADING DATA<span className={styles.blink}>▮</span></p>;
  if (!detail) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyCode}>$ select_company</p>
        <p>Select a company to view its earnings history.</p>
      </div>
    );
  }
  const { company, earnings, peers, metrics, quote } = detail;
  const sorted = sortDesc(earnings);
  const latest = sorted[0] ?? null;
  const score = earningsScore(earnings);
  const verdict = buildVerdict(detail);

  return (
    <>
      <CompanyProfile company={company} quote={quote} />
      {score.grade !== '—' && <VerdictBanner verdict={verdict} grade={score.grade} score={score.value} />}

      {latest && (
        <div className={styles.latestBar}>
          <div className={styles.latestItem}>
            <span className={styles.latestLabel}>Latest Quarter</span>
            <span className={styles.latestValue}>Q{latest.quarter} {latest.year}</span>
          </div>
          <div className={styles.latestItem}>
            <span className={styles.latestLabel}>EPS</span>
            <span className={styles.latestValue}>{latest.epsActual?.toFixed(2) ?? '—'}</span>
            {latest.epsSurprisePct != null && (
              <span className={latest.epsSurprisePct >= 0 ? styles.upBadge : styles.downBadge}>
                {pct(latest.epsSurprisePct)}
              </span>
            )}
          </div>
          <div className={styles.latestItem}>
            <span className={styles.latestLabel}>Analyst Expectation</span>
            <span className={styles.latestValue}>{latest.epsEstimate?.toFixed(2) ?? '—'}</span>
          </div>
          <div className={styles.latestItem}>
            <span className={styles.latestLabel}>Revenue</span>
            <span className={styles.latestValue}>{formatLarge(latest.revenueActual)}</span>
          </div>
        </div>
      )}

      <CompanyStats metrics={metrics} quote={quote} />

      {earnings.length > 1 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>EPS Trend</h2>
          <Sparkline earnings={earnings} />
        </section>
      )}

      <QuarterTable earnings={earnings} />
      <TrendBar earnings={earnings} />
      <PeerSuggestions peers={peers} />
    </>
  );
}

function ComparisonView({
  a, b, loadingA, loadingB,
}: {
  a: CompanyDetail | null; b: CompanyDetail | null; loadingA: boolean; loadingB: boolean;
}) {
  const scoreA = a ? earningsScore(a.earnings) : null;
  const scoreB = b ? earningsScore(b.earnings) : null;

  const mapA = new Map((a?.earnings ?? []).map((e) => [`Q${e.quarter} ${e.year}`, e]));
  const mapB = new Map((b?.earnings ?? []).map((e) => [`Q${e.quarter} ${e.year}`, e]));
  const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort((x, y) => {
    const [qx, yx] = x.split(' ');
    const [qy, yy] = y.split(' ');
    const numX = Number(yx);
    const numY = Number(yy);
    const qX = Number(qx.replace('Q', ''));
    const qY = Number(qy.replace('Q', ''));
    return numY - numX || qY - qX;
  });

  return (
    <div className={styles.compareWrap}>
      <div className={styles.compareHeads}>
        <div className={styles.compareCol}>
          {a ? (
            <div className={styles.compareProfile}>
              <div className={styles.compareSymbol}>{a.company.symbol}</div>
              <div className={styles.compareName}>{a.company.name}</div>
              {scoreA && scoreA.grade !== '—' && <span className={`${styles.gradeBadge} ${styles[`grade${scoreA.grade}`]}`}>{scoreA.grade}</span>}
            </div>
          ) : (
            <div className={styles.compareEmpty}>WAITING FOR COMPANY A…</div>
          )}
        </div>
        <div className={styles.compareVs}>VS</div>
        <div className={styles.compareCol}>
          {b ? (
            <div className={styles.compareProfile}>
              <div className={styles.compareSymbol}>{b.company.symbol}</div>
              <div className={styles.compareName}>{b.company.name}</div>
              {scoreB && scoreB.grade !== '—' && <span className={`${styles.gradeBadge} ${styles[`grade${scoreB.grade}`]}`}>{scoreB.grade}</span>}
            </div>
          ) : (
            <div className={styles.compareEmpty}>
              {loadingB ? 'LOADING…' : 'SEARCH FOR COMPANY B USING THE SEARCH BAR ABOVE'}
            </div>
          )}
        </div>
      </div>

      {(a || b) && keys.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Head-to-Head</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th>{a?.company.symbol ?? 'A'} EPS</th>
                  <th>{a?.company.symbol ?? 'A'} Surprise</th>
                  <th>{b?.company.symbol ?? 'B'} EPS</th>
                  <th>{b?.company.symbol ?? 'B'} Surprise</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const eA = mapA.get(k);
                  const eB = mapB.get(k);
                  return (
                    <tr key={k}>
                      <td className={styles.quarterLabel}>{k}</td>
                      <td>{eA?.epsActual?.toFixed(2) ?? '—'}</td>
                      <td>
                        {eA?.epsSurprisePct != null ? (
                          <span className={eA.epsSurprisePct >= 0 ? styles.surpriseBeat : styles.surpriseMiss}>{pct(eA.epsSurprisePct)}</span>
                        ) : '—'}
                      </td>
                      <td>{eB?.epsActual?.toFixed(2) ?? '—'}</td>
                      <td>
                        {eB?.epsSurprisePct != null ? (
                          <span className={eB.epsSurprisePct >= 0 ? styles.surpriseBeat : styles.surpriseMiss}>{pct(eB.epsSurprisePct)}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ── main app ── */

export function App() {
  const [detailA, setDetailA] = useState<CompanyDetail | null>(null);
  const [detailB, setDetailB] = useState<CompanyDetail | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingB, setLoadingB] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSlot, setTargetSlot] = useState<'a' | 'b'>('a');
  const [tapeQuotes, setTapeQuotes] = useState<TickerQuote[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Company[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 250);

  useEffect(() => {
    fetchTickerQuotes(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMD', 'META'])
      .then(setTapeQuotes)
      .catch(() => setTapeQuotes([]));
  }, []);

  const loadSlot = useCallback(async (slot: 'a' | 'b', symbol: string) => {
    if (slot === 'a') setLoadingA(true);
    else setLoadingB(true);
    setError(null);
    const d = await fetchCompanyEarnings(symbol);
    if (slot === 'a') {
      setDetailA(d);
      setLoadingA(false);
      if (d && compareMode) setTargetSlot('b');
    } else {
      setDetailB(d);
      setLoadingB(false);
    }
    if (!d) setError(`No data available for ${symbol}. Try a US-listed ticker.`);
  }, [compareMode]);

  useEffect(() => {
    loadSlot('a', 'AAPL');
  }, [loadSlot]);

  useEffect(() => {
    if (!debouncedQuery.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    searchCompanies(debouncedQuery)
      .then((results) => setSearchResults(results))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (company: Company) => {
    setSearchQuery('');
    setSearchResults([]);
    loadSlot(targetSlot, company.symbol);
  };

  const handleToggleCompare = () => {
    const next = !compareMode;
    setCompareMode(next);
    setTargetSlot(next && detailA ? 'b' : 'a');
  };

  const clearB = () => {
    setDetailB(null);
    setTargetSlot('b');
  };

  return (
    <div className={styles.page}>
      <TickerTape quotes={tapeQuotes} />
      <main className={styles.container}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>▮▮</span>
            <span className={styles.brandName}>ORBIT</span>
            <span className={styles.brandDivider}>//</span>
            <span className={styles.brandSub}>EARNINGS</span>
            <span className={styles.cursor} />
          </div>
          <p className={styles.kicker}>Quarterly earnings intelligence</p>
          <h1>Company Earnings Terminal</h1>
          <p className={styles.subtitle}>Search a US-listed company to decode its quarterly earnings performance.</p>
        </header>

        <div className={styles.searchArea} ref={searchRef}>
          {compareMode && (
            <div className={styles.slotChips}>
              <button
                className={targetSlot === 'a' ? styles.slotActive : styles.slot}
                onClick={() => setTargetSlot('a')}
              >
                A · {detailA?.company.symbol ?? '—'}
              </button>
              <button
                className={targetSlot === 'b' ? styles.slotActive : styles.slot}
                onClick={() => setTargetSlot('b')}
              >
                B · {detailB?.company.symbol ?? '—'}
              </button>
            </div>
          )}
          <div className={styles.searchInputWrap}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder={compareMode ? `Search company ${targetSlot.toUpperCase()} by name or ticker…` : 'Search company by name or ticker…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {compareMode && targetSlot === 'b' && detailB && (
              <button className={styles.clearBtn} onClick={clearB} aria-label="Clear company B">✕</button>
            )}
          </div>
          <SearchDropdown query={searchQuery} results={searchResults} loading={searchLoading} onSelect={handleSelect} />
        </div>

        <div className={styles.modeBar}>
          <button className={compareMode ? styles.modeToggleActive : styles.modeToggle} onClick={handleToggleCompare}>
            {compareMode ? '⟲ EXIT COMPARISON' : '⧉ COMPARE'}
          </button>
        </div>

        {error && <p className={styles.error}>⚠ {error}</p>}

        {!compareMode ? (
          <SingleView detail={detailA} loading={loadingA} />
        ) : (
          <ComparisonView a={detailA} b={detailB} loadingA={loadingA} loadingB={loadingB} />
        )}
      </main>
    </div>
  );
}

export default App;
