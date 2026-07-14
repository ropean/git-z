import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RepoData } from "./types";
import {
  classifyActivityLevel,
  classifyGrowth,
  classifyMaturity,
  computeAuthorStats,
  computeBusFactor,
  computeChurnTrend,
  computeCommitStats,
  computeCoupling,
  computeDirectoryStats,
  computeDocHealth,
  computeFileStats,
  computeHealthScore,
  computeInsights,
  computeKeywords,
  computeLanguageActivity,
  computePeriodComparison,
  computeReleaseStats,
  computeTestRatio,
  generateExecutiveSummary,
} from "./stats";
import { categoricalColor, prefersDark } from "./theme";
import { formatCompactTimestamp } from "./format";
import { buildTree, countEntries } from "./tree";
import { useDebouncedValue } from "./useDebouncedValue";
import { Header } from "./components/Header";
import { NavTabs, type NavItem } from "./components/NavTabs";
import { TimelineFilterBar } from "./components/TimelineFilterBar";
import { OverviewSection, computeKpi } from "./components/OverviewSection";
import { ProjectStructureSection } from "./components/ProjectStructureSection";
import { LanguagesSection } from "./components/LanguagesSection";
import { DirectoriesSection } from "./components/DirectoriesSection";
import { CommitsSection } from "./components/CommitsSection";
import { RhythmSection } from "./components/RhythmSection";
import { ContributorsSection } from "./components/ContributorsSection";
import { BranchesSection } from "./components/BranchesSection";
import { ReleasesSection } from "./components/ReleasesSection";
import { FileHeatSection } from "./components/FileHeatSection";
import { CouplingSection } from "./components/CouplingSection";
import { KeywordsSection } from "./components/KeywordsSection";
import { InsightsSection } from "./components/InsightsSection";
import { CommitDrawer } from "./components/CommitDrawer";

const DAY_MS = 86400000;

// The report's title/header show just the repo folder's name, not its full
// (possibly long, possibly just ".") path.
function deriveRepoName(repoPath: string): string {
  return repoPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || repoPath;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", group: "Overview" },
  { id: "commits", label: "Commits", group: "Activity" },
  { id: "rhythm", label: "Rhythm", group: "Activity" },
  { id: "structure", label: "Structure", group: "Code" },
  { id: "languages", label: "Languages", group: "Code" },
  { id: "directories", label: "Directories", group: "Code" },
  { id: "files", label: "File Heat", group: "Code" },
  { id: "coupling", label: "Coupling", group: "Code" },
  { id: "contributors", label: "Contributors", group: "People" },
  { id: "branches", label: "Branches", group: "Branches & Releases" },
  { id: "releases", label: "Releases", group: "Branches & Releases" },
  { id: "keywords", label: "Keywords", group: "Insights" },
  { id: "insights", label: "Insights", group: "Insights" },
];

export function App({ data }: { data: RepoData }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<"light" | "dark">(() => (prefersDark() ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const repoName = useMemo(() => deriveRepoName(data.repoPath), [data.repoPath]);
  useEffect(() => {
    document.title = `${repoName} digit report on ${formatCompactTimestamp(data.generatedAt)}`;
  }, [repoName, data.generatedAt]);
  const dark = theme === "dark";

  const commitTimes = useMemo(() => data.commits.map((c) => new Date(c.date).getTime()).filter((t) => !Number.isNaN(t)), [data.commits]);
  const minDate = useMemo(() => (commitTimes.length ? new Date(Math.min(...commitTimes)) : new Date()), [commitTimes]);
  const maxDate = useMemo(() => (commitTimes.length ? new Date(Math.max(...commitTimes)) : new Date()), [commitTimes]);

  const [quickRange, setQuickRange] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date>(minDate);
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
  const hasActiveFilters = !!(authorFilter || fileFilter || messageFilter || searchQuery);
  const clearFilters = useCallback(() => {
    setAuthorFilter(null);
    setFileFilter("");
    setMessageFilter("");
    setSearchQuery("");
    setPage(1);
  }, []);

  // Debouncing the value that actually drives filtering/aggregation avoids
  // recomputing every derived stat (coupling, heatmap, etc.) on each
  // intermediate keystroke/drag.
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

  const kpi = useMemo(() => computeKpi(filteredCommits), [filteredCommits]);
  const authorStats = useMemo(() => computeAuthorStats(filteredCommits), [filteredCommits]);
  const fileStats = useMemo(() => computeFileStats(filteredCommits), [filteredCommits]);
  const coupling = useMemo(() => computeCoupling(filteredCommits, 12), [filteredCommits]);
  const keywords = useMemo(() => computeKeywords(filteredCommits), [filteredCommits]);
  const commitStats = useMemo(() => computeCommitStats(filteredCommits), [filteredCommits]);
  const busFactor = useMemo(() => computeBusFactor(authorStats), [authorStats]);
  const directoryStats = useMemo(() => computeDirectoryStats(filteredCommits), [filteredCommits]);
  const languageActivity = useMemo(() => computeLanguageActivity(filteredCommits), [filteredCommits]);

  const languages = useMemo(() => data.languages ?? [], [data.languages]);
  const branchStats = useMemo(() => data.branchStats ?? [], [data.branchStats]);
  const tagStats = useMemo(() => data.tagStats ?? [], [data.tagStats]);

  const allAuthorStats = useMemo(() => computeAuthorStats(data.commits), [data.commits]);
  // Health/Insights and the Branches/Releases tabs describe whole-repo state
  // (branch/tag data isn't scoped to the date filter to begin with), so they
  // deliberately use every commit rather than filteredCommits.
  const now = useMemo(() => new Date(), []);
  const allFileStats = useMemo(() => computeFileStats(data.commits), [data.commits]);
  const allCommitStats = useMemo(() => computeCommitStats(data.commits), [data.commits]);
  const allBusFactor = useMemo(() => computeBusFactor(allAuthorStats), [allAuthorStats]);
  const allChurnTrend = useMemo(() => computeChurnTrend(data.commits), [data.commits]);
  const releaseStats = useMemo(() => computeReleaseStats(tagStats, data.commits), [tagStats, data.commits]);
  const navItems = useMemo(
    () => (releaseStats.length > 0 ? BASE_NAV_ITEMS : BASE_NAV_ITEMS.filter((item) => item.id !== "releases")),
    [releaseStats.length],
  );
  const docHealth = useMemo(() => computeDocHealth(data.tree, data.commits, now), [data.tree, data.commits, now]);
  const testRatio = useMemo(() => computeTestRatio(data.tree), [data.tree]);
  const treeCounts = useMemo(() => countEntries(buildTree(data.tree)), [data.tree]);
  const health = useMemo(
    () =>
      computeHealthScore({
        commits: data.commits,
        authorStats: allAuthorStats,
        busFactor: allBusFactor,
        branchStats,
        releaseStats,
        churnTrend: allChurnTrend,
        docHealth,
        now,
      }),
    [data.commits, allAuthorStats, allBusFactor, branchStats, releaseStats, allChurnTrend, docHealth, now],
  );
  const insights = useMemo(
    () =>
      computeInsights({
        commits: data.commits,
        authorStats: allAuthorStats,
        busFactor: allBusFactor,
        branchStats,
        releaseStats,
        churnTrend: allChurnTrend,
        docHealth,
        now,
        fileStats: allFileStats,
        health,
        commitStats: allCommitStats,
      }),
    [data.commits, allAuthorStats, allBusFactor, branchStats, releaseStats, allChurnTrend, docHealth, now, allFileStats, health, allCommitStats],
  );

  const ageDays = useMemo(() => (commitTimes.length ? Math.round((now.getTime() - minDate.getTime()) / DAY_MS) : null), [commitTimes.length, minDate, now]);
  const maturity = useMemo(() => classifyMaturity(ageDays), [ageDays]);
  const rangeDays = useMemo(() => Math.max(1, (dateTo.getTime() - dateFrom.getTime()) / DAY_MS), [dateFrom, dateTo]);
  const activityLevel = useMemo(() => classifyActivityLevel(kpi.totalCommits / (rangeDays / 30), allChurnTrend), [kpi.totalCommits, rangeDays, allChurnTrend]);
  const growth = useMemo(() => classifyGrowth(allChurnTrend), [allChurnTrend]);
  const periodComparison = useMemo(() => computePeriodComparison(dateFrom, dateTo, data.commits), [dateFrom, dateTo, data.commits]);
  const executiveSummary = useMemo(
    () =>
      generateExecutiveSummary({
        repoAgeDays: ageDays,
        maturity,
        totalCommits: data.commits.length,
        totalContributors: allAuthorStats.length,
        activityLevel,
        growth,
        currentLines: data.currentLines ?? null,
        health,
        insights,
      }),
    [ageDays, maturity, data.commits.length, allAuthorStats.length, activityLevel, growth, data.currentLines, health, insights],
  );

  const primaryLanguage = languages[0]?.language;
  const lastReleaseDate = tagStats.length ? [...tagStats].sort((a, b) => b.date.localeCompare(a.date))[0].date : undefined;
  const repoInfo = useMemo(
    () => ({
      totalCommits: data.commits.length,
      totalContributors: allAuthorStats.length,
      currentLines: data.currentLines,
      createdAt: commitTimes.length ? minDate : undefined,
      branches: data.branches.length,
      tags: data.tags.length,
      remoteUrl: data.remoteUrl,
      license: data.license,
      primaryLanguage,
      avgCommitsPerDay: allCommitStats.avgPerDay,
      currentBranch: data.filters.branch,
      lastCommitDate: commitTimes.length ? maxDate : undefined,
      lastReleaseDate,
      totalFiles: treeCounts.files,
      totalDirectories: treeCounts.folders,
      repoSizeBytes: data.repoSizeBytes,
      largestFilePath: data.largestFilePath,
      largestFileBytes: data.largestFileBytes,
    }),
    [
      data.commits.length,
      allAuthorStats.length,
      data.currentLines,
      commitTimes.length,
      minDate,
      maxDate,
      data.branches.length,
      data.tags.length,
      data.remoteUrl,
      data.license,
      primaryLanguage,
      allCommitStats.avgPerDay,
      data.filters.branch,
      lastReleaseDate,
      treeCounts.files,
      treeCounts.folders,
      data.repoSizeBytes,
      data.largestFilePath,
      data.largestFileBytes,
    ],
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
  const onSelectDirectory = useCallback(
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
        repoName={repoName}
        repoPath={data.repoPath}
        searchQuery={searchQuery}
        onSearchChange={(v) => {
          setSearchQuery(v);
          setPage(1);
        }}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <NavTabs items={navItems} active={activeSection} onSelect={jumpTo} />
      <TimelineFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        quickRange={quickRange}
        onQuickRange={handleQuickRange}
        onApplyCustomRange={handleApplyCustomRange}
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
          <div className="content-inner">
            {/* Grouped — and alternately tinted — to match the nav tabs above, so a
                long scroll reads as distinct regions (Overview / Activity / Code /
                People / Branches & Releases / Insights) instead of one unbroken list
                of look-alike sections. */}
            <div className="section-group">
              <OverviewSection
                kpi={kpi}
                commits={filteredCommits}
                repo={repoInfo}
                health={health}
                periodComparison={periodComparison}
                monthlySeries={allChurnTrend}
                maturity={maturity}
                activityLevel={activityLevel}
                growth={growth}
                executiveSummary={executiveSummary}
                testRatio={testRatio}
                docDetail={docHealth.detail}
              />
            </div>

            <div className="section-group section-group-tint">
              <div className="section-group-label">Activity</div>
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
              <RhythmSection commits={filteredCommits} commitStats={commitStats} />
            </div>

            <div className="section-group">
              <div className="section-group-label">Code</div>
              <ProjectStructureSection tree={data.tree} />
              <LanguagesSection languages={languages} activity={languageActivity} dark={dark} />
              <DirectoriesSection directories={directoryStats} onSelectDirectory={onSelectDirectory} />
              <FileHeatSection files={fileStats} onSelectFile={onSelectFile} />
              <CouplingSection pairs={coupling.pairs} nodes={coupling.nodes} />
            </div>

            <div className="section-group section-group-tint">
              <div className="section-group-label">People</div>
              <ContributorsSection
                authors={authorStats}
                authorFilter={authorFilter}
                onSelectAuthor={onSelectAuthor}
                authorColor={authorColor}
                busFactor={busFactor}
                fileStats={fileStats}
              />
            </div>

            <div className="section-group">
              <div className="section-group-label">Branches &amp; Releases</div>
              <BranchesSection branches={branchStats} />
              {releaseStats.length > 0 && <ReleasesSection releases={releaseStats} />}
            </div>

            <div className="section-group section-group-tint">
              <div className="section-group-label">Insights</div>
              <KeywordsSection keywords={keywords} />
              <InsightsSection health={health} insights={insights} />
            </div>
          </div>
        </div>
      </div>

      {selectedCommit && (
        <CommitDrawer
          commit={selectedCommit}
          allCommits={data.commits}
          remoteUrl={data.remoteUrl}
          openFile={drawerFileOpen}
          onToggleFile={(path) => setDrawerFileOpen((prev) => (prev === path ? null : path))}
          onClose={() => setSelectedHash(null)}
        />
      )}
    </div>
  );
}
