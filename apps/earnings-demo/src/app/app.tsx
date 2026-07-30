import { useEffect, useMemo, useRef, useState } from 'react';
import { searchCompanies, fetchCompanyEarnings } from './api';
import type { Company, EarningsEvent, PeerSuggestion } from './api';
import styles from './app.module.css';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
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
        <li className={styles.dropdownItem}>Searching...</li>
      ) : (
        results.map((c) => (
          <li key={c.symbol} className={styles.dropdownItem} onClick={() => onSelect(c)}>
            <span className={styles.dropdownSymbol}>{c.symbol}</span>
            <span className={styles.dropdownName}>{c.name}</span>
            {c.sector && <span className={styles.dropdownMeta}>{c.sector}</span>}
          </li>
        ))
      )}
    </ul>
  );
}

function formatLarge(num: number | null | undefined, digits = 2): string {
  if (num == null) return '—';
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(digits)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(digits)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(digits)}M`;
  return String(num);
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

function QuarterTable({ earnings }: { earnings: EarningsEvent[] }) {
  if (earnings.length === 0) return null;

  const sorted = [...earnings].sort((a, b) => b.year - a.year || b.quarter - a.quarter);

  return (
    <section className={styles.section}>
      <h2>Quarterly Earnings</h2>
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
                    {isBeat && <span className={styles.badgeBeat}>Beat</span>}
                    {isMiss && <span className={styles.badgeMiss}>Miss</span>}
                    {!isBeat && !isMiss && <span className={styles.badgeNeutral}>In-line</span>}
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

  const sorted = [...earnings].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  const latest = sorted[0];
  const prev = sorted[1];
  const epsQoQ = qoqGrowth(latest?.epsActual, prev?.epsActual);
  const sameQuarterLastYear = sorted.find((e) => e.quarter === latest?.quarter && e.year === latest?.year - 1);
  const epsYoY = yoyGrowth(latest, sameQuarterLastYear);

  const avgSurprise = earnings.reduce((sum, e) => sum + (e.epsSurprisePct ?? 0), 0) / earnings.length;
  const beats = earnings.filter((e) => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate).length;
  const misses = earnings.filter((e) => e.epsActual != null && e.epsEstimate != null && e.epsActual < e.epsEstimate).length;

  const items: Array<{ label: string; value: string; color: string }> = [
    { label: 'Avg Surprise', value: pct(avgSurprise), color: avgSurprise >= 0 ? '#16a34a' : '#dc2626' },
    { label: 'Beat Streak', value: `${beats}-${misses}`, color: beats >= misses ? '#16a34a' : '#dc2626' },
    { label: 'EPS QoQ', value: epsQoQ != null ? pct(epsQoQ) : '—', color: epsQoQ != null ? (epsQoQ >= 0 ? '#16a34a' : '#dc2626') : '#64748b' },
    { label: 'EPS YoY', value: epsYoY != null ? pct(epsYoY) : '—', color: epsYoY != null ? (epsYoY >= 0 ? '#16a34a' : '#dc2626') : '#64748b' },
    { label: 'Total Quarters', value: String(earnings.length), color: '#4f46e5' },
  ];

  return (
    <section className={styles.section}>
      <h2>Trends</h2>
      <div className={styles.trendGrid}>
        {items.map((item) => (
          <div key={item.label} className={styles.trendCard}>
            <span className={styles.trendLabel}>{item.label}</span>
            <span className={styles.trendValue} style={{ color: item.color }}>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompanyProfile({ company }: { company: Company }) {
  return (
    <div className={styles.profile}>
      <div className={styles.profileInfo}>
        {company.logo && <img src={company.logo} alt="" className={styles.logo} />}
        <div>
          <h2 className={styles.profileName}>{company.name}</h2>
          <div className={styles.profileMeta}>
            <span className={styles.profileSymbol}>{company.symbol}</span>
            {company.exchange && <span>{company.exchange}</span>}
            {company.sector && <span>{company.sector}</span>}
            {company.industry && <span>{company.industry}</span>}
            {company.marketCap != null && <span>MCap: ${(company.marketCap / 1000).toFixed(1)}B</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PeerSuggestions({ peers }: { peers: PeerSuggestion[] }) {
  if (peers.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2>Peer Companies</h2>
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

export function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Company[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [peers, setPeers] = useState<PeerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 250);

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

  useEffect(() => {
    if (selectedCompany) return;
    setLoading(true);
    setError(null);
    fetchCompanyEarnings('AAPL')
      .then((d) => {
        if (d) { setSelectedCompany(d.company); setEarnings(d.earnings); setPeers(d.peers); }
      })
      .catch(() => setError('Failed to load default'))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const handleSelect = async (company: Company) => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCompany(null);
    setLoading(true);
    setError(null);
    const d = await fetchCompanyEarnings(company.symbol);
    if (d) {
      setSelectedCompany(d.company);
      setEarnings(d.earnings);
      setPeers(d.peers);
    } else {
      setError('Failed to load company data');
    }
    setLoading(false);
  };

  const latestEarnings = useMemo(() => {
    const sorted = [...earnings].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
    return sorted[0] ?? null;
  }, [earnings]);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.kicker}>Earnings Demo</p>
          <h1>Company Earnings History</h1>
          <p className={styles.subtitle}>Search a US-listed company to view its quarterly earnings performance.</p>
        </header>

        <div className={styles.searchArea} ref={searchRef}>
          <div className={styles.searchInputWrap}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search by company name or ticker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <SearchDropdown query={searchQuery} results={searchResults} loading={searchLoading} onSelect={handleSelect} />
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {loading && <p className={styles.loading}>Loading data...</p>}

        {selectedCompany && !loading && (
          <>
            <CompanyProfile company={selectedCompany} />

            {latestEarnings && (
              <div className={styles.latestBar}>
                <div className={styles.latestItem}>
                  <span className={styles.latestLabel}>Latest Quarter</span>
                  <span className={styles.latestValue}>Q{latestEarnings.quarter} {latestEarnings.year}</span>
                </div>
                <div className={styles.latestItem}>
                  <span className={styles.latestLabel}>EPS</span>
                  <span className={styles.latestValue}>{latestEarnings.epsActual?.toFixed(2) ?? '—'}</span>
                  {latestEarnings.epsSurprisePct != null && (
                    <span className={latestEarnings.epsSurprisePct >= 0 ? styles.upBadge : styles.downBadge}>
                      {pct(latestEarnings.epsSurprisePct)}
                    </span>
                  )}
                </div>
                <div className={styles.latestItem}>
                  <span className={styles.latestLabel}>Estimate</span>
                  <span className={styles.latestValue}>{latestEarnings.epsEstimate?.toFixed(2) ?? '—'}</span>
                </div>
                <div className={styles.latestItem}>
                  <span className={styles.latestLabel}>Revenue</span>
                  <span className={styles.latestValue}>{formatLarge(latestEarnings.revenueActual)}</span>
                </div>
              </div>
            )}

            <QuarterTable earnings={earnings} />
            <TrendBar earnings={earnings} />
            <PeerSuggestions peers={peers} />
          </>
        )}

        {!selectedCompany && !loading && !error && (
          <div className={styles.emptyState}>
            <p>Select a company to view earnings history.</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
