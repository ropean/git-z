export interface NavItem {
  id: string;
  label: string;
}

interface Props {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
}

export function NavTabs({ items, active, onSelect }: Props) {
  return (
    <div className="nav-tabs">
      {items.map((item) => (
        <button
          key={item.id}
          className={"nav-tab" + (active === item.id ? " active" : "")}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
