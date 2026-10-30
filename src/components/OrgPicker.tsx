"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Org, OrgSort, OrgStatusFilter } from "@/lib/data";

export {
  organizationAddHref,
  organizationHref,
  organizationEditHref,
} from "@/lib/paths";

export function AddOrganizationLink({ href }: { href: string }) {
  return (
    <Link href={href} className="plus-btn">
      + Add Organization
    </Link>
  );
}

export function SetDateActiveLink({
  href,
  name,
}: {
  href: string;
  name: string;
}) {
  return (
    <Link href={href} className="plus-btn plus-btn-wrap">
      Set Date Active for {name}
    </Link>
  );
}

export function OrgListNav({
  orgs,
  selectedId,
  onSelect,
  label = "Organizations",
}: {
  orgs: Org[];
  selectedId: string | null;
  onSelect: (org: Org) => void;
  label?: string;
}) {
  return (
    <nav className="org-sidebar-nav" aria-label={label}>
      {orgs.map((org) => (
        <button
          key={org.id}
          type="button"
          className={selectedId === org.id ? "is-active" : undefined}
          aria-current={selectedId === org.id ? "page" : undefined}
          onClick={() => onSelect(org)}
        >
          {org.name}
        </button>
      ))}
    </nav>
  );
}

export function OrgNameMenu({
  name,
  orgs,
  selectedId,
  sortOrder,
  orgStatus,
  showHidden,
  onSort,
  onOrgStatus,
  onShowHidden,
  onSelect,
  label = "Organizations",
}: {
  name: string;
  orgs: Org[];
  selectedId: string | null;
  sortOrder: OrgSort;
  orgStatus: OrgStatusFilter;
  showHidden: boolean;
  onSort: (next: OrgSort) => void;
  onOrgStatus: (next: OrgStatusFilter) => void;
  onShowHidden: (next: boolean) => void;
  onSelect: (org: Org) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      const active = document.activeElement;
      if (active instanceof HTMLSelectElement && root.contains(active)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const filters = panel?.querySelector(".org-picker-filters");
    if (!panel || !(filters instanceof HTMLElement)) return;
    const menu = panel;
    const filterSection = filters;
    function syncHeight() {
      menu.style.setProperty(
        "--org-menu-list-max",
        `${filterSection.getBoundingClientRect().height * 2}px`,
      );
    }
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(filters);
    return () => observer.disconnect();
  }, [open]);

  return (
    <div className="org-name-menu" ref={rootRef}>
      <button
        type="button"
        className="page-title org-back"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        {name}
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="org-name-menu-list"
          role="dialog"
          aria-label={label}
        >
          <OrgPicker
            orgs={orgs}
            selectedId={selectedId}
            sortOrder={sortOrder}
            orgStatus={orgStatus}
            showHidden={showHidden}
            onSort={onSort}
            onOrgStatus={onOrgStatus}
            onShowHidden={onShowHidden}
            onSelect={(org) => {
              onSelect(org);
              setOpen(false);
            }}
            label={label}
          />
        </div>
      ) : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.3 11.5a.7.7 0 0 0 0 .5A11.8 11.8 0 0 0 12 18.7c5.2 0 9-4.4 9.7-6.7a.7.7 0 0 0 0-.5A11.8 11.8 0 0 0 12 5.3c-5.2 0-9 4.4-9.7 6.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M10.5 10.6A3 3 0 0 0 13.4 13.5M9.9 5.5A11 11 0 0 1 12 5.3c5.2 0 9 4.4 9.7 6.7a.7.7 0 0 1 0 .5 12.6 12.6 0 0 1-3.1 4.1M6.2 6.6C4 8.2 2.6 10.3 2.3 11.5a.7.7 0 0 0 0 .5A11.8 11.8 0 0 0 12 18.7c1.2 0 2.3-.2 3.4-.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HiddenToggle({
  showHidden,
  onShowHidden,
}: {
  showHidden: boolean;
  onShowHidden: (next: boolean) => void;
}) {
  const label = showHidden ? "show only visible" : "show hidden";
  return (
    <button
      type="button"
      className="show-hidden show-hidden-toggle"
      aria-pressed={showHidden}
      aria-label={label}
      onClick={() => onShowHidden(!showHidden)}
    >
      {showHidden ? <EyeOffIcon /> : <EyeIcon />}
      {label}
    </button>
  );
}

function OrgFilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="date-range-field org-filter-field">
      <span className="date-range-label">{label}</span>
      {children}
    </label>
  );
}

export function OrgStatusSelect({
  value,
  onChange,
}: {
  value: OrgStatusFilter;
  onChange: (next: OrgStatusFilter) => void;
}) {
  return (
    <OrgFilterField label="Status">
      <select
        className="app-field app-select"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(
            next === "active" || next === "inactive" ? next : "all",
          );
        }}
      >
        <option value="all">all</option>
        <option value="active">active</option>
        <option value="inactive">inactive</option>
      </select>
    </OrgFilterField>
  );
}

export function OrgPicker({
  orgs,
  selectedId,
  sortOrder,
  orgStatus,
  showHidden,
  onSort,
  onOrgStatus,
  onShowHidden,
  onSelect,
  label = "Organizations",
  parts = "all",
}: {
  orgs: Org[];
  selectedId: string | null;
  sortOrder: OrgSort;
  orgStatus: OrgStatusFilter;
  showHidden: boolean;
  onSort: (next: OrgSort) => void;
  onOrgStatus: (next: OrgStatusFilter) => void;
  onShowHidden: (next: boolean) => void;
  onSelect: (org: Org) => void;
  label?: string;
  parts?: "all" | "controls" | "list";
}) {
  return (
    <div
      className={`org-picker${parts === "list" ? " org-picker-list" : ""}`}
    >
      {parts === "list" ? null : (
        <fieldset className="filter-set org-picker-filters">
          <legend>Organizations</legend>
          <OrgFilterField label="Sort">
            <select
              className="app-field app-select"
              value={sortOrder}
              onChange={(event) => {
                const value = event.target.value;
                onSort(
                  value === "old" || value === "az" || value === "za"
                    ? value
                    : "new",
                );
              }}
            >
              <option value="new">newest</option>
              <option value="old">oldest</option>
              <option value="az">ABC ↑</option>
              <option value="za">ABC ↓</option>
            </select>
          </OrgFilterField>
          <OrgStatusSelect value={orgStatus} onChange={onOrgStatus} />
          <HiddenToggle showHidden={showHidden} onShowHidden={onShowHidden} />
        </fieldset>
      )}
      {parts === "controls" ? null : (
        <OrgListNav
          orgs={orgs}
          selectedId={selectedId}
          onSelect={onSelect}
          label={label}
        />
      )}
    </div>
  );
}
