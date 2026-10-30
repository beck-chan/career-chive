"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function MobileFilters({
  children,
  disabled = false,
  label = "filter & sort",
}: {
  children: ReactNode;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  if (disabled && open) setOpen(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const keep = event.composedPath().some((node) => {
        if (!(node instanceof Element)) return false;
        if (rootRef.current?.contains(node)) return true;
        return (
          node.classList.contains("theme-picker-panel") ||
          node.classList.contains("filter-checks-panel")
        );
      });
      if (!keep) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`mobile-filters${open ? " is-open" : ""}${disabled ? " is-inert" : ""}`}
      inert={disabled || undefined}
    >
      <div id={panelId} className="mobile-filters-panel">
        <div className="mobile-filters-panel-inner">
          <div className="mobile-filters-body">{children}</div>
        </div>
      </div>
      <button
        type="button"
        className="mobile-filters-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className="mobile-filters-caret" aria-hidden="true" />
      </button>
    </div>
  );
}
