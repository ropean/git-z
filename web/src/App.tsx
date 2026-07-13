import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RepoData } from "./types";
import {
  computeAuthorStats,
  computeCommitHeatmap,
  computeCoupling,
  computeDailyDensity,
  computeFileStats,
  computeKeywords,
  computeSurvival,
} from "./stats";
import { categoricalColor, prefersDark } from "./theme";
import { formatCompactTimestamp } from "./format";
import { useDebouncedValue } from "./useDebouncedValue";
import { Header } from "./components/Header";
import { NavTabs, type NavItem } from "./components/NavTabs";
import { TimelineFilterBar } from "./components/TimelineFilterBar";
import { OverviewSection, computeKpi } from "./components/OverviewSection";
import { ProjectStructureSection } from "./components/ProjectStructureSection";
import { CommitsSection } from "./components/CommitsSection";
import { ContributorsSection } from "./components/ContributorsSection";
import { FileHeatSection } from "./components/FileHeatSection";
import { CouplingSection } from "./components/CouplingSection";
import { SurvivalSection } from "./components/SurvivalSection";
import { KeywordsSection } from "./components/KeywordsSection";
import { CommitDrawer } from "./components/CommitDrawer";

const DAY_MS = 86400000;

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "structure", label: "Structure" },
  { id: "commits", label: "Commits" },
  { id: "contributors", label: "Contributors" },
  { id: "files", label: "File Heat" },
  { id: "coupling", label: "Coupling" },
  { id: "survival", label: "Survival" },
  { id: "keywords", label: "Keywords" },
];

export function App({ data }: { data: RepoData }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<"light" | "dark">(() => (prefersDark() ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const repoName = data.repoPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || data.repoPath;
    document.title = `${repoName} digit report on ${formatCompactTimestamp(data.generatedAt)}`;
  }, [data.repoPath, data.generatedAt]);
  const dark = theme === "dark";

  const commitTimes = useMemo(() => data.commits.map((c) => new Date(c.date).getTime()).filter((t) => !Number.isNaN(t)), [data.commits]);
  const minDate = useMemo(() => (commitTimes.length ? new Date(Math.min(...commitTimes)) : new Date()), [commitTimes]);
  const maxDate = useMemo(() => (commitTimes.length ? new Date(Math.max(...commitTimes)) : new Date()), [commitTimes]);

  const [quickRange, setQuickRange] = useState("90");
  const [dateFrom, setDateFrom] = useState<Date>(() => new Date(Math.max(minDate.getTime(), maxDate.getTime() - 90 * DAY_MS)));
  const [dateTo, setDateTo] = useState<Date>(maxDate);

  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState("");
  const [messageFilter, setMessageFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [drawerFileOpen, setDrawerFileOpen] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [page, setPage] = useState(1);

  const jumpTo = useCallback((id: string) => {
    setActiveSection(id);
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector("#sec-" + id);
      if (el) (el as HTMLElement).scrollIntoView({ block: "start" });
    });
  }, []);

  const handleQuickRange = useCallback(
    (id: string) => {
      setQuickRange(id);
      if (id === "all") {
        setDateFrom(minDate);
        setDateTo(maxDate);
      } else {
        const days = Number(id);
        const from = new Date(maxDate.getTime() - days * DAY_MS);
        setDateFrom(from < minDate ? minDate : from);
        setDateTo(maxDate);
      }
      setPage(1);
    },
    [minDate, maxDate],
  );

  // Applied atomically from the custom-range popover's "Apply" button,
  // rather than live as each field changes — swap if the user entered them
  // backwards instead of silently clamping to an empty range.
  const handleApplyCustomRange = useCallback((fromIso: string, toIso: string) => {
    let from = new Date(fromIso + "T00:00:00");
    let to = new Date(toIso + "T23:59:59");
    if (from > to) [from, to] = [new Date(toIso + "T00:00:00"), new Date(fromIso + "T23:59:59")];
    setQuickRange("custom");
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  }, []);
  const handleRangeFrom = useCallback(
    (dayIndex: number) => {
      const candidate = new Date(minDate.getTime() + dayIndex * DAY_MS);
      setQuickRange("custom");
      setDateFrom(candidate > dateTo ? dateTo : candidate);
      setPage(1);
    },
    [minDate, dateTo],
  );
  const handleRangeTo = useCallback(
    (dayIndex: number) => {
      const candidate = new Date(minDate.getTime() + dayIndex * DAY_MS);
      setQuickRange("custom");
      setDateTo(candidate < dateFrom ? dateFrom : candidate);
      setPage(1);
    },
    [minDate, dateFrom],
  );

  const hasActiveFilters = !!(authorFilter || fileFilter || messageFilter || searchQuery);
  const clearFilters = useCallback(() => {
    setAuthorFilter(null);
    setFileFilter("");
    setMessageFilter("");
    setSearchQuery("");
    setPage(1);
  }, []);

  // The date range updates on every pixel of a slider drag; debouncing the
  // value that actually drives filtering/aggregation keeps that drag smooth
  // instead of recomputing every derived stat (coupling, growth, etc.) on
  // each intermediate position. The slider and density chart still read the
  // live dateFrom/dateTo below, so dragging itself feels instant.
  const debouncedDateFrom = useDebouncedValue(dateFrom, 120);
  const debouncedDateTo = useDebouncedValue(dateTo, 120);
  const debouncedFileFilter = useDebouncedValue(fileFilter, 150);
  const debouncedMessageFilter = useDebouncedValue(messageFilter, 150);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 150);

  const filteredCommits = useMemo(() => {
    const fromMs = debouncedDateFrom.getTime();
    const toMs = debouncedDateTo.getTime();
    const fileQ = debouncedFileFilter.trim().toLowerCase();
    const msgQ = debouncedMessageFilter.trim().toLowerCase();
    const searchQ = debouncedSearchQuery.trim().toLowerCase();
    return data.commits
      .filter((c) => {
        const t = new Date(c.date).getTime();
        if (t < fromMs || t > toMs) return false;
        if (authorFilter && c.authorName !== authorFilter) return false;
        if (fileQ && !(c.files ?? []).some((f) => f.path.toLowerCase().includes(fileQ))) return false;
        if (msgQ && !c.subject.toLowerCase().includes(msgQ)) return false;
        if (searchQ) {
          const hit =
            c.subject.toLowerCase().includes(searchQ) ||
            c.authorName.toLowerCase().includes(searchQ) ||
            (c.files ?? []).some((f) => f.path.toLowerCase().includes(searchQ));
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.commits, debouncedDateFrom, debouncedDateTo, authorFilter, debouncedFileFilter, debouncedMessageFilter, debouncedSearchQuery]);

  const density = useMemo(() => computeDailyDensity(data.commits), [data.commits]);
  const kpi = useMemo(() => computeKpi(filteredCommits), [filteredCommits]);
  const authorStats = useMemo(() => computeAuthorStats(filteredCommits), [filteredCommits]);
  const fileStats = useMemo(() => computeFileStats(filteredCommits), [filteredCommits]);
  const coupling = useMemo(() => computeCoupling(filteredCommits, 12), [filteredCommits]);
  const heatmap = useMemo(() => computeCommitHeatmap(filteredCommits), [filteredCommits]);
  const keywords = useMemo(() => computeKeywords(filteredCommits), [filteredCommits]);
  const survival = useMemo(() => computeSurvival(filteredCommits), [filteredCommits]);

  const allAuthorStats = useMemo(() => computeAuthorStats(data.commits), [data.commits]);
  const repoInfo = useMemo(
    () => ({
      totalCommits: data.commits.length,
      totalContributors: allAuthorStats.length,
      currentLines: data.currentLines,
      createdAt: commitTimes.length ? minDate : undefined,
      branches: data.branches.length,
      tags: data.tags.length,
      remoteUrl: data.remoteUrl,
    }),
    [data.commits.length, allAuthorStats.length, data.currentLines, commitTimes.length, minDate, data.branches.length, data.tags.length, data.remoteUrl],
  );
  const authorColorIndex = useMemo(() => {
    const m = new Map<string, number>();
    allAuthorStats.forEach((a, i) => m.set(a.name, i));
    return m;
  }, [allAuthorStats]);
  const authorColor = useCallback((name: string) => categoricalColor(authorColorIndex.get(name) ?? 0, dark), [authorColorIndex, dark]);

  const selectedCommit = useMemo(() => (selectedHash ? data.commits.find((c) => c.hash === selectedHash) ?? null : null), [selectedHash, data.commits]);

  const onSelectAuthor = useCallback(
    (name: string) => {
      setAuthorFilter((prev) => (prev === name ? null : name));
      setPage(1);
      jumpTo("commits");
    },
    [jumpTo],
  );
  const onSelectFile = useCallback(
    (path: string) => {
      setFileFilter(path);
      setPage(1);
      jumpTo("commits");
    },
    [jumpTo],
  );

  return (
    <div className="app">
      <Header
        repoName={data.repoPath}
        searchQuery={searchQuery}
        onSearchChange={(v) => {
          setSearchQuery(v);
          setPage(1);
        }}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <NavTabs items={NAV_ITEMS} active={activeSection} onSelect={jumpTo} />
      <TimelineFilterBar
        minDate={minDate}
        maxDate={maxDate}
        dateFrom={dateFrom}
        dateTo={dateTo}
        quickRange={quickRange}
        density={density}
        onQuickRange={handleQuickRange}
        onApplyCustomRange={handleApplyCustomRange}
        onRangeFrom={handleRangeFrom}
        onRangeTo={handleRangeTo}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        filteredCount={filteredCommits.length}
        totalCount={data.commits.length}
      />
      {data.truncated && (
        <div className="banner" style={{ margin: "8px 20px 0" }}>
          This report was truncated by --max-commits — only the most recent commits are included, and all stats
          below are computed from that subset.
        </div>
      )}
      <div className="body-wrap">
        <div className="content-area" ref={scrollRef}>
          <OverviewSection kpi={kpi} heatmap={heatmap} repo={repoInfo} />
          <ProjectStructureSection tree={data.tree} />
          <CommitsSection
            commits={filteredCommits}
            authorNames={allAuthorStats.map((a) => a.name)}
            authorFilter={authorFilter}
            onAuthorFilterChange={(v) => {
              setAuthorFilter(v);
              setPage(1);
            }}
            fileFilter={fileFilter}
            onFileFilterChange={(v) => {
              setFileFilter(v);
              setPage(1);
            }}
            messageFilter={messageFilter}
            onMessageFilterChange={(v) => {
              setMessageFilter(v);
              setPage(1);
            }}
            page={page}
            onPageChange={setPage}
            selectedHash={selectedHash}
            onSelectCommit={(hash) => {
              setSelectedHash(hash);
              setDrawerFileOpen(null);
            }}
            authorColor={authorColor}
          />
          <ContributorsSection authors={authorStats} authorFilter={authorFilter} onSelectAuthor={onSelectAuthor} authorColor={authorColor} />
          <FileHeatSection files={fileStats} onSelectFile={onSelectFile} />
          <CouplingSection pairs={coupling.pairs} nodes={coupling.nodes} />
          <SurvivalSection survival={survival} />
          <KeywordsSection keywords={keywords} />
        </div>
      </div>

      {selectedCommit && (
        <CommitDrawer
          commit={selectedCommit}
          remoteUrl={data.remoteUrl}
          openFile={drawerFileOpen}
          onToggleFile={(path) => setDrawerFileOpen((prev) => (prev === path ? null : path))}
          onClose={() => setSelectedHash(null)}
        />
      )}
    </div>
  );
}
