interface Props {
  repoName: string;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Header({ repoName, searchQuery, onSearchChange, theme, onToggleTheme }: Props) {
  return (
    <div className="header">
      <div className="header-left">
        <div className="logo-mark">◆</div>
        <div className="repo-name" title={repoName}>{repoName}</div>
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
