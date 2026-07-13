export interface NavItem {
  id: string;
  label: string;
  group: string;
}

interface Props {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
}

export function NavTabs({ items, active, onSelect }: Props) {
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const item of items) {
    let g = groups[groups.length - 1];
    if (!g || g.name !== item.group) {
      g = { name: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  return (
    <div className="nav-tabs">
      {groups.map((g, gi) => (
        <div className="nav-group" key={g.name}>
          {gi > 0 && <div className="nav-divider" />}
          <span className="nav-group-label">{g.name}</span>
          {g.items.map((item) => (
            <button
              key={item.id}
              className={"nav-tab" + (active === item.id ? " active" : "")}
              onClick={() => onSelect(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
