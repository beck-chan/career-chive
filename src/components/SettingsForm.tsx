"use client";

import { useEffect, useRef, useState } from "react";
import { PasswordField, requestOpenSettings } from "./AppChrome";
import { ModalShell } from "./ModalShell";
import { MobileFilters } from "./MobileFilters";
import { OrgNameMenu, OrgPicker } from "./OrgPicker";
import { ThemeDateField } from "./ThemeDateField";
import { CopyableUrlField } from "./CopyableUrlField";
import { EmptyBody, ErrorBody } from "./PageStates";
import { useDemo } from "../lib/demo";
import { organizationHref } from "../lib/paths";
import {
  WEEKDAYS,
  todayIso,
  blankOrg,
  formatDayTitle,
  formatLongDate,
  filterOrgList,
  isBlankDay,
  loggingWindow,
  newOrganizationId,
  orgMatchesStatus,
  orgNameInUse,
  orgRange,
  shiftIso,
  sortOrgs,
  type DayEntry,
  type Org,
  type OrgSort,
  type OrgStatusFilter,
} from "../lib/data";

function sameWeekdays(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.every((day, index) => day === b[index]);
}

const ORG_SECTIONS = [
  { id: "name", label: "Name" },
  { id: "generate", label: "Generate Days" },
  { id: "active", label: "Date Active" },
  { id: "inactive", label: "Date Inactive" },
  { id: "hidden", label: "Visibility" },
  { id: "bulk", label: "Bulk Management" },
] as const;

type OrgTab = (typeof ORG_SECTIONS)[number]["id"];

function ModalClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn modal-close"
      aria-label="Close"
      onClick={onClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 6l12 12M18 6 6 18"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function rangeCopy(from: string, to: string) {
  if (from === to) return formatDayTitle(from);
  return `${formatDayTitle(from)} – ${formatDayTitle(to)}`;
}

function hasContentInRange(
  dayMap: Record<string, DayEntry> | undefined,
  from: string,
  to: string,
) {
  return Object.entries(dayMap ?? {}).some(([iso, day]) => {
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return !isBlankDay(day);
  });
}

// Clear All / Delete All span every stored day, including leftovers Archive
// will not open. The from/to pickers are not floored to Archive Start, so
// those leftovers can be removed here. Org delete still refuses while any
// stored day remains.
function daySpan(
  dayMap: Record<string, unknown> | undefined,
  fallbackFrom: string,
  fallbackTo: string,
) {
  const keys = Object.keys(dayMap ?? {});
  if (!keys.length) return { from: fallbackFrom, to: fallbackTo };
  let from = keys[0];
  let to = keys[0];
  for (const iso of keys) {
    if (iso < from) from = iso;
    if (iso > to) to = iso;
  }
  return { from, to };
}

function ConfirmPassword({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  return (
    <div className="modal-password">
      <div className="setting-field">
        <span className="setting-label">Enter Password</span>
        <PasswordField
          value={value}
          onChange={onChange}
          focusOnMount
          aria-label="Enter Password"
        />
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M6.5 7.5 7.4 19.2A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.49.49 0 0 0-.48-.41h-3.84a.49.49 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13.2 6.3 17.7 10.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M4 20l4.1-1.1L19.2 7.8a1.7 1.7 0 0 0 0-2.4l-.6-.6a1.7 1.7 0 0 0-2.4 0L5.1 15.9 4 20Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5 9.5 17 19 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SettingsForm({
  startAdding = false,
  queryOrg,
  queryEdit = false,
}: {
  startAdding?: boolean;
  queryOrg?: string;
  queryEdit?: boolean;
} = {}) {
  const {
    status,
    settings,
    days,
    clearDaysInRange,
    deleteDaysInRange,
    saveOrganization,
    deleteOrganization,
  } = useDemo();
  const dbError = status === "error";
  const missingArchiveStart = !dbError && !settings.archiveStartDate;
  const today = todayIso(undefined, settings.timezone);
  const orgs = dbError ? [] : settings.orgs;
  const noOrgs = orgs.length === 0;
  const [draft] = useState<Org | null>(() =>
    startAdding ? blankOrg() : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(draft?.id ?? null);
  const [sortOrder, setSortOrder] = useState<OrgSort>("new");
  const [showHidden, setShowHidden] = useState(false);
  const [orgStatus, setOrgStatus] = useState<OrgStatusFilter>("all");
  const [editing, setEditing] = useState<Org | null>(draft);
  const [pendingDelete, setPendingDelete] = useState<Org | null>(null);
  const [pendingBulk, setPendingBulk] = useState<
    { kind: "clear" | "delete"; from: string; to: string; all?: boolean } | null
  >(null);
  const [pendingGenerateDays, setPendingGenerateDays] = useState(false);
  const [tab, setTab] = useState<OrgTab>("name");
  const [clearFrom, setClearFrom] = useState(settings.archiveStartDate);
  const [clearTo, setClearTo] = useState(today);
  const [deleteFrom, setDeleteFrom] = useState(settings.archiveStartDate);
  const [deleteTo, setDeleteTo] = useState(today);
  const [syncedBulkOrg, setSyncedBulkOrg] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [orgSaveAttempted, setOrgSaveAttempted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const adding = Boolean(
    !dbError &&
      !missingArchiveStart &&
      editing &&
      !orgs.some((org) => org.id === editing.id),
  );
  const duplicateOrgName = Boolean(
    adding && editing && orgNameInUse(editing.name, orgs),
  );
  const orgSections = adding
    ? ORG_SECTIONS.filter((item) => item.id !== "bulk")
    : ORG_SECTIONS;
  if (adding && tab === "bulk") setTab("name");
  const pendingKey = pendingDelete?.id ?? pendingBulk?.kind ?? null;

  if (pendingKey !== confirmFor) {
    setConfirmFor(pendingKey);
    if (confirmPassword) setConfirmPassword("");
    if (confirmError) setConfirmError("");
  }

  useEffect(() => {
    if (!pendingDelete && !pendingBulk && !pendingGenerateDays) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingDelete(null);
        setPendingBulk(null);
        setPendingGenerateDays(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, pendingBulk, pendingGenerateDays]);

  useEffect(() => {
    if (!startAdding && !queryEdit) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("add") && !url.searchParams.has("edit")) return;
    url.searchParams.delete("add");
    url.searchParams.delete("edit");
    const next = `${url.pathname}${url.search}${url.hash}`;
    const timer = window.setTimeout(() => {
      window.history.replaceState(null, "", next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [startAdding, queryEdit]);

  function hasDayEntries(orgId: string) {
    const map = days[orgId];
    return Boolean(map && Object.keys(map).length > 0);
  }

  const visibleOrgs = filterOrgList(orgs, { showHidden, orgStatus, today });
  const listed = [...visibleOrgs];
  if (adding && editing) {
    listed.push({
      ...editing,
      name: editing.name.trim() || "new organization",
    });
  }
  const sortedOrgs = sortOrgs(listed, sortOrder);

  const selected = selectedId
    ? (editing?.id === selectedId
        ? editing
        : (orgs.find((org) => org.id === selectedId) ??
          sortedOrgs.find((org) => org.id === selectedId) ??
          null))
    : null;
  const isEditing = Boolean(editing && selected && editing.id === selected.id);
  useEffect(() => {
    if (isEditing && tab === "name") nameInputRef.current?.focus();
  }, [isEditing, tab]);
  const headingName =
    (isEditing && editing ? editing.name.trim() : selected?.name.trim()) ||
    "Add Organization";
  const bulkBounds = selected
    ? orgRange(selected, settings.archiveStartDate, today)
    : loggingWindow(settings.archiveStartDate, "", "", today);
  const allTimeSpan = selected
    ? daySpan(days[selected.id], bulkBounds.minIso, bulkBounds.maxIso)
    : { from: bulkBounds.minIso, to: bulkBounds.maxIso };
  const selectedKey = selected?.id ?? null;
  const bulkSyncKey = `${selectedKey ?? ""}:${allTimeSpan.from}:${allTimeSpan.to}`;

  if (bulkSyncKey !== syncedBulkOrg) {
    setSyncedBulkOrg(bulkSyncKey);
    setClearFrom(allTimeSpan.from);
    setClearTo(allTimeSpan.to);
    setDeleteFrom(allTimeSpan.from);
    setDeleteTo(allTimeSpan.to);
  }
  const clearCap = clearTo > today ? today : clearTo;
  const deleteCap = deleteTo > today ? today : deleteTo;
  if (clearTo !== clearCap) setClearTo(clearCap);
  if (deleteTo !== deleteCap) setDeleteTo(deleteCap);
  if (clearFrom && clearFrom > clearCap) setClearFrom(clearCap);
  if (deleteFrom && deleteFrom > deleteCap) setDeleteFrom(deleteCap);

  const listedSelected = selectedId
    ? orgs.find((org) => org.id === selectedId)
    : null;
  if (selectedId && !adding && (!orgs.length || !listedSelected)) {
    setSelectedId(null);
  }

  const queryKey =
    !startAdding && queryOrg
      ? `${queryOrg}:${queryEdit ? "edit" : "view"}`
      : "";
  if (queryKey && orgs.length && appliedQuery !== queryKey) {
    const org = orgs.find((item) => item.id === queryOrg);
    setAppliedQuery(queryKey);
    if (org) {
      if (org.hidden) setShowHidden(true);
      if (!orgMatchesStatus(org, orgStatus, today)) setOrgStatus("all");
      setSelectedId(org.id);
      setOrgSaveAttempted(false);
      if (queryEdit) {
        setTab("active");
        setEditing({ ...org });
      } else {
        setTab("name");
        setEditing(null);
      }
    }
  }

  function selectOrg(org: Org) {
    setEditing(null);
    setOrgSaveAttempted(false);
    setSelectedId(org.id);
    setTab("name");
  }

  function startAdd() {
    if (editing || missingArchiveStart) return;
    const next = blankOrg();
    setEditing(next);
    setOrgSaveAttempted(false);
    setSelectedId(next.id);
    setTab("name");
  }

  function cancelEdit() {
    const wasAdding = adding;
    setEditing(null);
    setOrgSaveAttempted(false);
    if (wasAdding) setSelectedId(null);
  }

  function preparedOrg() {
    if (!editing) return null;
    const name = editing.name.trim();
    const dateActive = editing.dateActive.trim();
    if (!name || !dateActive) return null;
    return {
      ...editing,
      name,
      dateActive,
      id: adding ? newOrganizationId(name) : editing.id,
    };
  }

  function commitOrg(next: Org) {
    void saveOrganization(next);
    setPendingGenerateDays(false);
    setEditing(null);
    setSelectedId(next.id);
  }

  function saveOrg() {
    if (!editing) return;
    const next = preparedOrg();
    if (!next) {
      const name = editing.name.trim();
      setOrgSaveAttempted(true);
      setTab(!name ? "name" : "active");
      return;
    }
    setOrgSaveAttempted(false);
    const stored = orgs.find((org) => org.id === editing.id);
    if (
      stored &&
      next.autoGenerateDays.length > 0 &&
      !sameWeekdays(stored.autoGenerateDays, next.autoGenerateDays)
    ) {
      setPendingGenerateDays(true);
      return;
    }
    commitOrg(next);
  }

  function confirmGenerateDays() {
    const next = preparedOrg();
    if (!next) {
      setPendingGenerateDays(false);
      return;
    }
    commitOrg(next);
  }

  async function confirmDelete() {
    if (!confirmPassword.trim()) return;
    if (!pendingDelete || hasDayEntries(pendingDelete.id)) {
      setPendingDelete(null);
      return;
    }
    const ok = await deleteOrganization(pendingDelete.id, confirmPassword);
    if (!ok) {
      setConfirmError("Incorrect password.");
      return;
    }
    if (selectedId === pendingDelete.id) setSelectedId(null);
    if (editing?.id === pendingDelete.id) setEditing(null);
    setPendingDelete(null);
  }

  async function confirmBulk() {
    if (!confirmPassword.trim()) return;
    if (!pendingBulk || !selected) {
      setPendingBulk(null);
      return;
    }
    const ok =
      pendingBulk.kind === "clear"
        ? await clearDaysInRange(
            selected.id,
            pendingBulk.from,
            pendingBulk.to,
            confirmPassword,
          )
        : await deleteDaysInRange(
            selected.id,
            pendingBulk.from,
            pendingBulk.to,
            confirmPassword,
          );
    if (!ok) {
      setConfirmError("Incorrect password.");
      return;
    }
    setPendingBulk(null);
  }

  const pickerProps = {
    orgs: sortedOrgs,
    selectedId: selected?.id ?? null,
    sortOrder,
    showHidden,
    orgStatus,
    onSort: setSortOrder,
    onShowHidden: setShowHidden,
    onOrgStatus: setOrgStatus,
    onSelect: selectOrg,
  };

  function addButton() {
    return (
      <button
        type="button"
        className="plus-btn"
        disabled={Boolean(editing) || dbError || missingArchiveStart}
        onClick={startAdd}
      >
        + Add Organization
      </button>
    );
  }

  const canDelete = selected ? !hasDayEntries(selected.id) : false;
  const generateDaysHidden = Boolean(
    isEditing && editing ? editing.hidden : selected?.hidden,
  );
  const generateDaysUnset = !settings.autogenerateStartDate;
  const generateDaysLocked = generateDaysHidden || generateDaysUnset;
  const orgDays = selected ? days[selected.id] : undefined;
  const canClearAll = Object.values(orgDays ?? {}).some((day) => !isBlankDay(day));
  const canClearRange =
    Boolean(clearFrom && clearTo && clearFrom <= clearTo) &&
    hasContentInRange(orgDays, clearFrom, clearTo);

  return (
      <div className="page-cols">
        <div className="org-layout">
          <aside
            className={`org-sidebar${dbError || missingArchiveStart || noOrgs ? " is-inert" : ""}`}
            inert={dbError || missingArchiveStart || noOrgs || undefined}
          >
            <OrgPicker {...pickerProps} />
          </aside>
          <section
            className={`org-day${selected && !missingArchiveStart ? "" : " org-day-empty"}`}
            aria-label="Organization"
          >
            <header className="day-heading org-page-heading">
              {selected && !missingArchiveStart ? (
                <>
                  {isEditing && editing ? (
                    <>
                      <div className="org-heading-actions org-heading-labeled">
                        <button
                          type="button"
                          className="text-link"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={saveOrg}
                        >
                          Save
                        </button>
                      </div>
                      <div className="day-row-actions org-heading-icons">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Cancel"
                          onClick={cancelEdit}
                        >
                          <CloseIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-save"
                          aria-label="Save"
                          onClick={saveOrg}
                        >
                          <CheckIcon />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="org-heading-actions org-heading-labeled">
                        <button
                          type="button"
                          className="text-btn"
                          title={
                            canDelete
                              ? "Delete"
                              : "Cannot delete an organization with entries. Adjust visibility instead."
                          }
                          disabled={!canDelete}
                          onClick={() => setPendingDelete(selected)}
                        >
                          <TrashIcon />
                          Delete
                        </button>
                        <button
                          type="button"
                          className="plus-btn"
                          onClick={() => setEditing({ ...selected })}
                        >
                          <PencilIcon />
                          Edit
                        </button>
                      </div>
                      <div className="day-row-actions org-heading-icons">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={
                            canDelete
                              ? "Delete"
                              : "Cannot delete an organization with entries. Adjust visibility instead."
                          }
                          title={
                            canDelete
                              ? "Delete"
                              : "Cannot delete an organization with entries. Adjust visibility instead."
                          }
                          disabled={!canDelete}
                          onClick={() => setPendingDelete(selected)}
                        >
                          <TrashIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-edit"
                          aria-label="Edit"
                          onClick={() => setEditing({ ...selected })}
                        >
                          <PencilIcon />
                        </button>
                      </div>
                    </>
                  )}
                  <OrgNameMenu
                    name={headingName}
                    {...pickerProps}
                  />
                </>
              ) : (
                <h1 className="page-title">Organizations</h1>
              )}
            </header>
            <div className="org-day-body">
              {dbError ? (
                <ErrorBody />
              ) : missingArchiveStart ? (
                <EmptyBody
                  kicker="No Archive Start date configured."
                  copy="Configure your Settings to begin."
                  action={
                    <button
                      type="button"
                      className="plus-btn"
                      onClick={() => requestOpenSettings("archive")}
                    >
                      <GearIcon />
                      Open Settings
                    </button>
                  }
                />
              ) : selected ? (
                <>
                  <article className="col-copy day-panel">
                    <div
                      className="day-tabs"
                      role="tablist"
                      aria-label="Organization sections"
                    >
                      {orgSections.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={tab === item.id}
                          className={tab === item.id ? "is-active" : undefined}
                          onClick={() => setTab(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <section
                      className={`day-section${tab === "name" ? " is-active" : ""}`}
                    >
                      <h3>Name</h3>
                      <p className="day-section-sub">
                        How this organization is listed in the archive. 
                      </p>
                      <div
                        className={
                          adding
                            ? undefined
                            : `org-name-row${isEditing ? " is-editing" : ""}`
                        }
                      >
                        {isEditing && editing ? (
                          <input
                            ref={nameInputRef}
                            className="app-field"
                            value={editing.name}
                            aria-invalid={
                              orgSaveAttempted && !editing.name.trim()
                                ? true
                                : undefined
                            }
                            aria-describedby={
                              orgSaveAttempted && !editing.name.trim()
                                ? "org-name-error"
                                : duplicateOrgName
                                  ? "org-name-duplicate"
                                  : undefined
                            }
                            onChange={(event) =>
                              setEditing({ ...editing, name: event.target.value })
                            }
                          />
                        ) : (
                          <p className="org-meta">{selected.name || "—"}</p>
                        )}
                        {!adding && selected ? (
                          <CopyableUrlField
                            href={organizationHref(selected.id)}
                            copyLabel="Copy Organization URL"
                            aria-label="Organization URL"
                          />
                        ) : null}
                      </div>
                      {isEditing && editing && orgSaveAttempted && !editing.name.trim() ? (
                        <p
                          id="org-name-error"
                          className="login-error"
                          role="alert"
                        >
                          Name is required.
                        </p>
                      ) : isEditing && editing && duplicateOrgName ? (
                        <p
                          id="org-name-duplicate"
                          className="login-error"
                          role="status"
                        >
                          You&apos;ve entered the name of an organization
                          already in CareerChive.
                        </p>
                      ) : null}
                    </section>
                    <section
                      className={`day-section${tab === "generate" ? " is-active" : ""}`}
                    >
                      <h3>Generate Days</h3>
                      <p className="day-section-sub">
                        Days of the week for which empty daily entries should be
                        auto-generated, gated by Auto-generate From and the organization&apos;s Date Active.
                      </p>
                      <table
                        className={`overview-table weekday-table${
                          generateDaysLocked ? " is-inert" : ""
                        }`}
                        inert={generateDaysLocked || undefined}
                      >
                        <thead>
                          <tr>
                            {WEEKDAYS.map((day) => (
                              <th key={`${day.id}-${day.label}`}>{day.short}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {WEEKDAYS.map((day) => {
                              const checked = (
                                isEditing && editing
                                  ? editing.autoGenerateDays
                                  : selected.autoGenerateDays
                              ).includes(day.id);
                              return (
                                <td key={`${day.id}-${day.label}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!isEditing || generateDaysLocked}
                                    aria-label={day.label}
                                    onChange={() => {
                                      if (!editing) return;
                                      const on = editing.autoGenerateDays.includes(
                                        day.id,
                                      );
                                      setEditing({
                                        ...editing,
                                        autoGenerateDays: on
                                          ? editing.autoGenerateDays.filter(
                                              (id) => id !== day.id,
                                            )
                                          : [...editing.autoGenerateDays, day.id].sort(
                                              (a, b) => a - b,
                                            ),
                                      });
                                    }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                      {generateDaysHidden ? (
                        <p className="login-error" role="alert">
                          This organization&apos;s visibility is hidden. No entries will be auto-generated until it is made visible.
                        </p>
                      ) : null}
                      {generateDaysUnset ? (
                        <p className="login-error" role="alert">
                          Set an Auto-generate From date to enable entry generation.
                        </p>
                      ) : null}
                    </section>
                    <section
                      className={`day-section${tab === "active" ? " is-active" : ""}`}
                    >
                      <h3>Date Active</h3>
                      <p className="day-section-sub">
                        Date from which entries are logged and auto-generated for this organization, further constrained by the floor set by Archive Start.
                      </p>
                      {isEditing && editing ? (
                        <>
                          <ThemeDateField
                            className="app-date"
                            aria-label="Date Active"
                            value={editing.dateActive}
                            until={
                              editing.dateInactive
                                ? shiftIso(editing.dateInactive, -1)
                                : undefined
                            }
                            today={today}
                            allowEmpty
                            onChange={(next) =>
                              setEditing({
                                ...editing,
                                dateActive: next,
                              })
                            }
                          />
                          {orgSaveAttempted && !editing.dateActive.trim() ? (
                            <p
                              id="org-date-active-error"
                              className="login-error"
                              role="alert"
                            >
                              Date Active is required.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="org-meta">
                          {formatLongDate(selected.dateActive) || "—"}
                        </p>
                      )}
                    </section>
                    <section
                      className={`day-section${tab === "inactive" ? " is-active" : ""}`}
                    >
                      <h3>Date Inactive</h3>
                      <p className="day-section-sub">
                        Date on which this organization is inactive and entries are no longer logged or auto-generated.
                      </p>
                      {isEditing && editing ? (
                        <ThemeDateField
                          className="app-date"
                          aria-label="Date Inactive"
                          value={editing.dateInactive}
                          min={
                            editing.dateActive
                              ? shiftIso(editing.dateActive, 1)
                              : undefined
                          }
                          today={today}
                          allowEmpty
                          onChange={(next) =>
                            setEditing({
                              ...editing,
                              dateInactive: next,
                            })
                          }
                        />
                      ) : (
                        <p className="org-meta">
                          {formatLongDate(selected.dateInactive) || "—"}
                        </p>
                      )}
                    </section>
                    <section
                      className={`day-section${tab === "hidden" ? " is-active" : ""}`}
                    >
                      <h3>Visibility</h3>
                      <p className="day-section-sub">
                        Hidden organizations do not auto-generate entries and are not shown by default in organization lists and search results.
                      </p>
                      {isEditing && editing ? (
                        <label className="show-hidden">
                          <input
                            type="checkbox"
                            checked={editing.hidden}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                hidden: event.target.checked,
                              })
                            }
                          />
                          Hidden
                        </label>
                      ) : (
                        <p className="org-meta">
                          {selected.hidden ? "Hidden" : "Visible"}
                        </p>
                      )}
                    </section>
                    {adding ? null : (
                    <section
                      className={`day-section${tab === "bulk" ? " is-active" : ""}`}
                    >
                      <h3>Bulk Management</h3>
                      <div className="bulk-manage-field">
                        <span className="setting-label">
                          Clear Data For
                        </span>
                        <div className="date-range">
                          <ThemeDateField
                            className="app-date"
                            aria-label="Clear data from"
                            value={clearFrom}
                            until={clearTo || today}
                            today={today}
                            onChange={setClearFrom}
                          />
                          <span className="date-range-sep">–</span>
                          <ThemeDateField
                            className="app-date"
                            aria-label="Clear data to"
                            value={clearTo}
                            min={clearFrom || undefined}
                            until={today}
                            today={today}
                            onChange={setClearTo}
                          />
                        </div>
                        <div className="bulk-manage-row">
                          <div className="org-heading-actions">
                            <button
                              type="button"
                              className="text-btn"
                              disabled={!canClearAll}
                              onClick={() => {
                                setPendingBulk({
                                  kind: "clear",
                                  from: allTimeSpan.from,
                                  to: allTimeSpan.to,
                                  all: true,
                                });
                              }}
                            >
                              Clear All
                            </button>
                          </div>
                          <div className="org-heading-actions">
                            <button
                              type="button"
                              className="plus-btn"
                              disabled={!canClearRange}
                              onClick={() =>
                                setPendingBulk({
                                  kind: "clear",
                                  from: clearFrom,
                                  to: clearTo,
                                })
                              }
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="bulk-manage-field">
                        <span className="setting-label">
                          Delete Days For
                        </span>
                        <div className="date-range">
                          <ThemeDateField
                            className="app-date"
                            aria-label="Delete days from"
                            value={deleteFrom}
                            until={deleteTo || today}
                            today={today}
                            onChange={setDeleteFrom}
                          />
                          <span className="date-range-sep">–</span>
                          <ThemeDateField
                            className="app-date"
                            aria-label="Delete days to"
                            value={deleteTo}
                            min={deleteFrom || undefined}
                            until={today}
                            today={today}
                            onChange={setDeleteTo}
                          />
                        </div>
                        <div className="bulk-manage-row">
                          <div className="org-heading-actions">
                            <button
                              type="button"
                              className="text-btn"
                              onClick={() => {
                                setPendingBulk({
                                  kind: "delete",
                                  from: allTimeSpan.from,
                                  to: allTimeSpan.to,
                                  all: true,
                                });
                              }}
                            >
                              Delete All
                            </button>
                          </div>
                          <div className="org-heading-actions">
                            <button
                              type="button"
                              className="plus-btn"
                              disabled={
                                !deleteFrom || !deleteTo || deleteFrom > deleteTo
                              }
                              onClick={() =>
                                setPendingBulk({
                                  kind: "delete",
                                  from: deleteFrom,
                                  to: deleteTo,
                                })
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                    )}
                  </article>
                </>
              ) : orgs.length === 0 && !adding ? (
                <EmptyBody
                  copy="Add your first organization to begin."
                  action={
                    <span className="org-empty-add-mobile">{addButton()}</span>
                  }
                />
              ) : (
                <>
                  <div
                    className={`org-add-inline${dbError ? " is-inert" : ""}`}
                    inert={dbError || undefined}
                  >
                    {addButton()}
                  </div>
                  <div className="org-landing-picker">
                    <OrgPicker {...pickerProps} parts="list" />
                  </div>
                  <p className="org-empty-prompt">
                    Select an organization to begin.
                  </p>
                </>
              )}
            </div>
          </section>
          <section
            className={`org-filters${dbError || missingArchiveStart ? " is-inert" : ""}`}
            aria-label="Add organization"
            inert={dbError || missingArchiveStart || undefined}
          >
            {addButton()}
          </section>
        </div>
        {missingArchiveStart || selected ? null : (
          <MobileFilters disabled={dbError || noOrgs}>
            <OrgPicker {...pickerProps} parts="controls" />
          </MobileFilters>
        )}
        {pendingDelete ? (
          <ModalShell onClose={() => setPendingDelete(null)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-org-title"
              aria-describedby="delete-org-warn"
            >
              <h2 id="delete-org-title" className="modal-title">
                Delete {pendingDelete.name}?
              </h2>
              <p id="delete-org-warn" className="modal-permanent">
                THIS ACTION IS PERMANENT AND CANNOT BE UNDONE.
              </p>
              <ConfirmPassword
                value={confirmPassword}
                onChange={(next) => {
                  setConfirmPassword(next);
                  if (confirmError) setConfirmError("");
                }}
                error={confirmError}
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setPendingDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-btn"
                  disabled={!confirmPassword.trim()}
                  onClick={confirmDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          </ModalShell>
        ) : null}
        {pendingBulk ? (
          <ModalShell onClose={() => setPendingBulk(null)}>
            <div
              className="modal create-entry-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-org-title"
              aria-describedby="bulk-org-warn"
            >
              <header className="modal-head">
                <h2 id="bulk-org-title" className="modal-title">
                  {pendingBulk.kind === "clear"
                    ? `Clear ${selected?.name} Data`
                    : `Delete ${selected?.name} Days`}
                </h2>
                <ModalClose onClick={() => setPendingBulk(null)} />
              </header>
              <p id="bulk-org-warn" className="modal-permanent">
                THIS ACTION IS PERMANENT AND CANNOT BE UNDONE.
              </p>
              <p className="modal-copy">
                {pendingBulk.all
                  ? pendingBulk.kind === "clear"
                    ? "All Time Data"
                    : "All Time Days"
                  : rangeCopy(pendingBulk.from, pendingBulk.to)}
              </p>
              <ConfirmPassword
                value={confirmPassword}
                onChange={(next) => {
                  setConfirmPassword(next);
                  if (confirmError) setConfirmError("");
                }}
                error={confirmError}
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setPendingBulk(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={
                    pendingBulk.kind === "clear" ? "plus-btn" : "text-btn"
                  }
                  disabled={!confirmPassword.trim()}
                  onClick={confirmBulk}
                >
                  {pendingBulk.kind === "clear"
                    ? pendingBulk.all
                      ? "Clear All"
                      : "Clear"
                    : pendingBulk.all
                      ? "Delete All"
                      : "Delete"}
                </button>
              </div>
            </div>
          </ModalShell>
        ) : null}
        {pendingGenerateDays ? (
          <ModalShell onClose={() => setPendingGenerateDays(false)}>
            <div
              className="modal create-entry-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="generate-days-confirm-title"
              aria-describedby="generate-days-confirm-copy"
            >
              <header className="modal-head">
                <h2 id="generate-days-confirm-title" className="modal-title">
                  Generate Days has changed.
                </h2>
                <ModalClose onClick={() => setPendingGenerateDays(false)} />
              </header>
              <p id="generate-days-confirm-copy" className="modal-copy">
                {settings.autogenerateStartDate
                  ? "Empty daily entries will be created for the checked days through today based on this organization's Date Active, beginning from Auto-generate From if they do not already exist."
                  : "No entries will be created until Auto-generate From is set."}
                <br />
                <br />
                Are you sure you want to continue?
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setPendingGenerateDays(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={confirmGenerateDays}
                >
                  Yes, Continue
                </button>
              </div>
            </div>
          </ModalShell>
        ) : null}
      </div>
  );
}
