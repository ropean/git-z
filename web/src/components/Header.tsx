interface Props {
  repoName: string;
  repoPath: string;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Header({ repoName, repoPath, searchQuery, onSearchChange, theme, onToggleTheme }: Props) {
  return (
    <div className="header">
      <div className="header-left">
        <svg className="logo-mark" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="currentColor" />
          <path d="M9 10.5h14L9.6 21.5H23" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="23" cy="9" r="2.6" fill="#8ecbff" />
        </svg>
        <div className="repo-name" title={repoPath}>{repoName}</div>
      </div>
      <div className="header-right">
        <input
          className="search-input"
          type="text"
          placeholder="Search commit message / author / file path…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </div>
  );
}
