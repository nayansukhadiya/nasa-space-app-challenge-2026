import type { ReactNode } from "react";

export type Provenance = "MEASURED" | "COMPUTED" | "MODELED";

const TAG_TITLE: Record<Provenance, string> = {
  MEASURED: "From spacecraft data",
  COMPUTED: "Physics applied to real data",
  MODELED: "Simplified approximation, labelled",
};

/** Every number on screen carries one of these (plan: accuracy principle). */
export function Tag({ kind }: { kind: Provenance }) {
  return (
    <span className="sw-tag" title={TAG_TITLE[kind]}>
      {kind}
    </span>
  );
}

/** Frosted-glass panel. */
export function Glass({
  children,
  className = "",
  as: Tag2 = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "aside" | "div" | "header" | "footer";
} & React.HTMLAttributes<HTMLElement>) {
  const T = Tag2 as React.ElementType;
  return (
    <T className={`sw-glass ${className}`} {...rest}>
      {children}
    </T>
  );
}

/** One-at-a-time sub-tabs: keeps every panel compact. */
export function SubTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="sw-subtabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`sw-subtab ${value === t.id ? "sw-subtab-on" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  icon,
  label,
  value,
  unit,
  tag,
  status,
  note,
}: {
  /** A small icon that says what the reading is about. */
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  tag?: Provenance;
  /** Accent is reserved for status only. */
  status?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className="sw-stat">
      <div className="sw-stat-top">
        <span className="sw-stat-label">
          {icon && <span className="sw2-stat-icon" aria-hidden>{icon}</span>}
          {label}
        </span>
        {tag && <Tag kind={tag} />}
      </div>
      <div className={`sw-stat-value ${status ? "sw-status" : ""}`}>
        {value}
        {unit && <span className="sw-stat-unit">{unit}</span>}
      </div>
      {note && <div className="sw-stat-note">{note}</div>}
    </div>
  );
}

export function Flag({ code }: { code: string }) {
  return <span className={`fi fi-${code} sw-flag`} role="img" aria-label={code.toUpperCase()} />;
}
