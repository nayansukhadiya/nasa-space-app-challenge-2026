"use client";

/** A pill-shaped single-choice control. One place for it, so the map header, layers and anything else match. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; text: string; title?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="sw-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`sw-seg-btn ${value === o.id ? "sw-seg-on" : ""}`}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          title={o.title}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}
