import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { buildEarningsView } from '@org/shared-utils';
import { searchCompanies, compareCompanies } from './api';
import type { Company, EarningsEvent, ComparisonResult } from './api';
import styles from './app.module.css';

type ViewItem = ReturnType<typeof buildEarningsView>[number];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SearchDropdown({
  query,
  results,
  loading,
  selected,
  onSelect,
}: {
  query: string;
  results: Company[];
  loading: boolean;
  selected: string[];
  onSelect: (c: Company) => void;
}) {
  if (!query.trim() || results.length === 0 || selected.length >= 2) return null;
  return (
    <ul className={styles.dropdown}>
      {loading ? (
        <li className={styles.dropdownItem}>Searching...</li>
      ) : (
        results.map((c) => (
          <li
            key={c.symbol}
            className={styles.dropdownItem}
            onClick={() => onSelect(c)}
          >
            <span className={styles.dropdownSymbol}>{c.symbol}</span>
            <span className={styles.dropdownName}>{c.name}</span>
            {c.sector && <span className={styles.dropdownMeta}>{c.sector}</span>}
          </li>
        ))
      )}
    </ul>
  );
}

function SummaryCard({
  company,
  view,
  earnings,
  onRemove,
}: {
  company: Company;
  view: ViewItem | undefined;
  earnings: EarningsEvent[];
  onRemove: () => void;
}) {
  const latest = earnings[0];
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.companyName}>{company.name}</p>
          <h2>{company.symbol}</h2>
        </div>
        <div className={styles.cardActions}>
          {view && (
            <span
              className={`${styles.badge} ${
                view.signal === 'beat'
                  ? styles.badgeBeat
                  : view.signal === 'miss'
                    ? styles.badgeMiss
                    : styles.badgeNeutral
              }`}
            >
              {view.signal}
            </span>
          )}
          <button className={styles.removeBtn} onClick={onRemove} aria-label="Remove">
            ✕
          </button>
        </div>
      </div>

      {view && (
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>EPS Surprise</span>
            <span className={styles.metricValue}>
              {view.epsDelta != null ? `${view.epsDelta.toFixed(3)}` : '—'}
            </span>
            {view.epsDeltaPct != null && (
              <span className={styles.metricDelta}>
                {view.epsDeltaPct >= 0 ? '+' : ''}{view.epsDeltaPct.toFixed(1)}%
              </span>
            )}
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Revenue Surprise</span>
            <span className={styles.metricValue}>
              {view.revenueDelta != null
                ? `$${(view.revenueDelta / 1_000_000_000).toFixed(2)}B`
                : '—'}
            </span>
            {view.revenueDeltaPct != null && (
              <span className={styles.metricDelta}>
                {view.revenueDeltaPct >= 0 ? '+' : ''}{view.revenueDeltaPct.toFixed(1)}%
              </span>
            )}
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Net Margin</span>
            <span className={styles.metricValue}>
              {view.netMarginPct != null ? `${view.netMarginPct.toFixed(1)}%` : '—'}
            </span>
          </div>
          {latest && (
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Latest Quarter</span>
              <span className={styles.metricValue}>
                Q{latest.quarter} {latest.year}
              </span>
            </div>
          )}
        </div>
      )}

      {!view && earnings.length === 0 && (
        <p className={styles.noData}>No earnings data available</p>
      )}
    </article>
  );
}

function ComparisonTable({
  companyA,
  companyB,
  viewA,
  viewB,
  earningsA,
  earningsB,
}: {
  companyA: Company;
  companyB: Company;
  viewA: ViewItem | undefined;
  viewB: ViewItem | undefined;
  earningsA: EarningsEvent[];
  earningsB: EarningsEvent[];
}) {
  if (!viewA && !viewB) return null;

  const rows: Array<{ label: string; valA: string; valB: string; better: 'A' | 'B' | 'tie' | null }> = [];

  if (viewA && viewB) {
    rows.push({
      label: 'EPS Surprise ($)',
      valA: viewA.epsDelta != null ? viewA.epsDelta.toFixed(3) : '—',
      valB: viewB.epsDelta != null ? viewB.epsDelta.toFixed(3) : '—',
      better:
        viewA.epsDelta != null && viewB.epsDelta != null
          ? viewA.epsDelta > viewB.epsDelta
            ? 'A'
            : viewB.epsDelta > viewA.epsDelta
              ? 'B'
              : 'tie'
          : null,
    });
    rows.push({
      label: 'EPS Surprise %',
      valA: viewA.epsDeltaPct != null ? `${(viewA.epsDeltaPct >= 0 ? '+' : '')}${viewA.epsDeltaPct.toFixed(1)}%` : '—',
      valB: viewB.epsDeltaPct != null ? `${(viewB.epsDeltaPct >= 0 ? '+' : '')}${viewB.epsDeltaPct.toFixed(1)}%` : '—',
      better:
        viewA.epsDeltaPct != null && viewB.epsDeltaPct != null
          ? viewA.epsDeltaPct > viewB.epsDeltaPct
            ? 'A'
            : viewB.epsDeltaPct > viewA.epsDeltaPct
              ? 'B'
              : 'tie'
          : null,
    });
    rows.push({
      label: 'Revenue Surprise ($)',
      valA: viewA.revenueDelta != null ? `$${(viewA.revenueDelta / 1_000_000_000).toFixed(2)}B` : '—',
      valB: viewB.revenueDelta != null ? `$${(viewB.revenueDelta / 1_000_000_000).toFixed(2)}B` : '—',
      better:
        viewA.revenueDelta != null && viewB.revenueDelta != null
          ? viewA.revenueDelta > viewB.revenueDelta
            ? 'A'
            : viewB.revenueDelta > viewA.revenueDelta
              ? 'B'
              : 'tie'
          : null,
    });
    rows.push({
      label: 'Revenue Surprise %',
      valA: viewA.revenueDeltaPct != null ? `${(viewA.revenueDeltaPct >= 0 ? '+' : '')}${viewA.revenueDeltaPct.toFixed(1)}%` : '—',
      valB: viewB.revenueDeltaPct != null ? `${(viewB.revenueDeltaPct >= 0 ? '+' : '')}${viewB.revenueDeltaPct.toFixed(1)}%` : '—',
      better:
        viewA.revenueDeltaPct != null && viewB.revenueDeltaPct != null
          ? viewA.revenueDeltaPct > viewB.revenueDeltaPct
            ? 'A'
            : viewB.revenueDeltaPct > viewA.revenueDeltaPct
              ? 'B'
              : 'tie'
          : null,
    });
    rows.push({
      label: 'Net Margin',
      valA: viewA.netMarginPct != null ? `${viewA.netMarginPct.toFixed(1)}%` : '—',
      valB: viewB.netMarginPct != null ? `${viewB.netMarginPct.toFixed(1)}%` : '—',
      better:
        viewA.netMarginPct != null && viewB.netMarginPct != null
          ? viewA.netMarginPct > viewB.netMarginPct
            ? 'A'
            : viewB.netMarginPct > viewA.netMarginPct
              ? 'B'
              : 'tie'
          : null,
    });
  }

  rows.push({
    label: 'Latest Quarter',
    valA: earningsA[0] ? `Q${earningsA[0].quarter} ${earningsA[0].year}` : '—',
    valB: earningsB[0] ? `Q${earningsB[0].quarter} ${earningsB[0].year}` : '—',
    better: null,
  });

  rows.push({
    label: 'EPS (Actual)',
    valA: earningsA[0]?.epsActual != null ? earningsA[0].epsActual.toFixed(2) : '—',
    valB: earningsB[0]?.epsActual != null ? earningsB[0].epsActual.toFixed(2) : '—',
    better: null,
  });

  rows.push({
    label: 'Revenue (Actual)',
    valA: earningsA[0]?.revenueActual != null ? `$${(earningsA[0].revenueActual / 1_000_000_000).toFixed(2)}B` : '—',
    valB: earningsB[0]?.revenueActual != null ? `$${(earningsB[0].revenueActual / 1_000_000_000).toFixed(2)}B` : '—',
    better: null,
  });

  return (
    <section className={styles.comparisonSection}>
      <h2>Comparison</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Metric</th>
              <th className={styles.colA}>{companyA.symbol}</th>
              <th className={styles.colB}>{companyB.symbol}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className={styles.metricName}>{row.label}</td>
                <td className={`${styles.colA} ${row.better === 'A' ? styles.better : ''}`}>
                  {row.valA}
                  {row.better === 'A' && <span className={styles.star}> ★</span>}
                </td>
                <td className={`${styles.colB} ${row.better === 'B' ? styles.better : ''}`}>
                  {row.valB}
                  {row.better === 'B' && <span className={styles.star}> ★</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PeerList({
  title,
  peers,
}: {
  title: string;
  peers: Array<{ symbol: string; name: string | null }>;
}) {
  if (peers.length === 0) return null;
  return (
    <div className={styles.peerGroup}>
      <h3>{title}</h3>
      <div className={styles.peerChips}>
        {peers.map((p) => (
          <span key={p.symbol} className={styles.peerChip}>
            <strong>{p.symbol}</strong>
            {p.name && <span className={styles.peerName}>{p.name}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Company[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 250);

  useEffect(() => {
    if (!debouncedQuery.trim() || selectedCompanies.length >= 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    searchCompanies(debouncedQuery)
      .then((results) => {
        setSearchResults(results.filter((c) => !selectedCompanies.find((s) => s.symbol === c.symbol)));
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [debouncedQuery, selectedCompanies]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadDefault = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await compareCompanies('AAPL', 'MSFT');
      if (result) {
        setSelectedCompanies([result.companyA, result.companyB]);
        setComparison(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load default');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDefault();
  }, [loadDefault]);

  const handleSelect = async (company: Company) => {
    if (selectedCompanies.length >= 2) return;
    const next = [...selectedCompanies, company];
    setSelectedCompanies(next);
    setSearchQuery('');
    setSearchResults([]);

    if (next.length === 2) {
      setLoading(true);
      setError(null);
      try {
        const result = await compareCompanies(next[0].symbol, next[1].symbol);
        setComparison(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Comparison failed');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemove = (symbol: string) => {
    const next = selectedCompanies.filter((c) => c.symbol !== symbol);
    setSelectedCompanies(next);
    if (next.length < 2) {
      setComparison(null);
    }
    setError(null);
  };

  const viewA = useMemo(() => {
    if (!comparison) return undefined;
    return buildEarningsView(
      comparison.earningsA.map((e) => ({
        label: `Q${e.quarter} ${e.year}`,
        epsActual: e.epsActual,
        epsEstimate: e.epsEstimate,
        revenueActual: e.revenueActual,
        revenueEstimate: e.revenueEstimate,
        netIncome: null,
      }))
    )[0];
  }, [comparison]);

  const viewB = useMemo(() => {
    if (!comparison) return undefined;
    return buildEarningsView(
      comparison.earningsB.map((e) => ({
        label: `Q${e.quarter} ${e.year}`,
        epsActual: e.epsActual,
        epsEstimate: e.epsEstimate,
        revenueActual: e.revenueActual,
        revenueEstimate: e.revenueEstimate,
        netIncome: null,
      }))
    )[0];
  }, [comparison]);

  const combinedPeers = useMemo(() => {
    if (!comparison) return { a: [], b: [] };
    return {
      a: comparison.peersA.filter((p) => p.symbol !== comparison.companyB.symbol),
      b: comparison.peersB.filter((p) => p.symbol !== comparison.companyA.symbol),
    };
  }, [comparison]);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.kicker}>Earnings Comparison</p>
          <h1>Compare Company Earnings</h1>
          <p className={styles.subtitle}>
            Search for US-listed companies to compare their latest earnings performance.
          </p>
        </header>

        <div className={styles.searchArea} ref={searchRef}>
          <div className={styles.searchInputWrap}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder={
                selectedCompanies.length >= 2
                  ? 'Max 2 companies selected'
                  : selectedCompanies.length === 1
                    ? 'Search for a second company...'
                    : 'Search by company name or ticker...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={selectedCompanies.length >= 2}
            />
          </div>
          <SearchDropdown
            query={searchQuery}
            results={searchResults}
            loading={searchLoading}
            selected={selectedCompanies.map((c) => c.symbol)}
            onSelect={handleSelect}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {loading && <p className={styles.loading}>Loading comparison data...</p>}

        {selectedCompanies.length > 0 && (
          <div className={styles.selectedBar}>
            {selectedCompanies.map((c) => (
              <span key={c.symbol} className={styles.selectedTag}>
                {c.symbol} — {c.name}
                <button className={styles.tagRemove} onClick={() => handleRemove(c.symbol)}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {selectedCompanies.length < 2 && !loading && (
          <div className={styles.emptyState}>
            <p>Select 2 companies to compare their earnings.</p>
          </div>
        )}

        <div className={styles.cardsGrid}>
          {comparison && (
            <>
              <SummaryCard
                company={comparison.companyA}
                view={viewA}
                earnings={comparison.earningsA}
                onRemove={() => handleRemove(comparison.companyA.symbol)}
              />
              <SummaryCard
                company={comparison.companyB}
                view={viewB}
                earnings={comparison.earningsB}
                onRemove={() => handleRemove(comparison.companyB.symbol)}
              />
            </>
          )}
        </div>

        {comparison && (
          <ComparisonTable
            companyA={comparison.companyA}
            companyB={comparison.companyB}
            viewA={viewA}
            viewB={viewB}
            earningsA={comparison.earningsA}
            earningsB={comparison.earningsB}
          />
        )}

        {comparison && (combinedPeers.a.length > 0 || combinedPeers.b.length > 0) && (
          <section className={styles.peersSection}>
            <h2>Peer Companies</h2>
            <div className={styles.peerGroups}>
              <PeerList title={`${comparison.companyA.symbol} peers`} peers={combinedPeers.a} />
              <PeerList title={`${comparison.companyB.symbol} peers`} peers={combinedPeers.b} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
