"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/components/ModalShell";
import { CalendarPanel } from "@/components/CalendarPanel";
import { ThemeDateField } from "@/components/ThemeDateField";
import { DayPanel } from "@/components/DayPanel";
import { MobileFilters } from "@/components/MobileFilters";
import { EmptyBody, ErrorBody } from "@/components/PageStates";
import {
  AddOrganizationLink,
  OrgNameMenu,
  OrgPicker,
  SetDateActiveLink,
  organizationAddHref,
  organizationEditHref,
} from "@/components/OrgPicker";
import { useDemo } from "@/lib/demo";
import {
  addMonths,
  clampIsoToWindow,
  filterOrgList,
  formatDayTitle,
  isBeforeArchiveStart,
  isBlankDay,
  isOnOrAfterDateInactive,
  isCreatableDay,
  orgMatchesStatus,
  orgRange,
  sortOrgs,
  todayIso,
  type Org,
  type OrgSort,
  type OrgStatusFilter,
} from "@/lib/data";
import { archiveDayHref } from "@/lib/paths";

const CAL_WINDOW = 3;
const PICKER_WINDOW = 6;

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function windowForIso(iso: string, minIso?: string, maxIso?: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  let month = date.getUTCMonth() + 1;
  let year = date.getUTCFullYear();
  const newest = monthKey(year, month);
  if (maxIso && newest > maxIso.slice(0, 7)) {
    year = Number(maxIso.slice(0, 4));
    month = Number(maxIso.slice(5, 7));
  }
  if (minIso && monthKey(year, month) < minIso.slice(0, 7)) {
    year = Number(minIso.slice(0, 4));
    month = Number(minIso.slice(5, 7));
  }
  return { year, month };
}

export function ArchiveView({
  queryOrg,
  queryIso,
}: {
  queryOrg?: string;
  queryIso?: string;
} = {}) {
  const {
    status,
    settings,
    days,
    getDay,
    setDay,
    createDay,
    removeDay,
    uploadAttachment,
    attachmentHref,
  } = useDemo();
  const dbError = status === "error";
  const today = todayIso(undefined, settings.timezone);
  const orgs = useMemo(
    () => (dbError ? [] : settings.orgs),
    [dbError, settings.orgs],
  );
  const addHref =
    !dbError && orgs.length === 0 ? organizationAddHref() : undefined;
  const noOrgs = orgs.length === 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId
    ? (orgs.find((org) => org.id === selectedId) ?? null)
    : null;
  const [selectedIso, setSelectedIso] = useState(today);
  const [calStart, setCalStart] = useState(() => windowForIso(today));
  const [sortOrder, setSortOrder] = useState<OrgSort>("new");
  const [showHidden, setShowHidden] = useState(false);
  const [orgStatus, setOrgStatus] = useState<OrgStatusFilter>("all");
  const [pendingCreateIso, setPendingCreateIso] = useState<string | null>(null);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [dismissedQuery, setDismissedQuery] = useState("");
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [pendingForId, setPendingForId] = useState(selectedId);
  const [syncedArchiveStart, setSyncedArchiveStart] = useState(
    settings.archiveStartDate,
  );
  const [awaitingDate, setAwaitingDate] = useState(false);

  function rangeOf(org: Org) {
    return orgRange(org, settings.archiveStartDate, today);
  }

  function selectOrg(org: Org) {
    const { minIso, maxIso } = rangeOf(org);
    setPendingCreateIso(null);
    setSelectedId(org.id);
    const next = clampIsoToWindow(today, minIso, maxIso);
    setSelectedIso(next);
    setCalStart(windowForIso(next, minIso, maxIso));
    setAwaitingDate(Boolean(org.dateActive));
  }

  function selectDay(iso: string, keepExisting = false) {
    if (!selected || !iso) return;
    setAwaitingDate(false);
    const { minIso, maxIso } = rangeOf(selected);
    if (
      isBeforeArchiveStart(iso, settings.archiveStartDate) ||
      isOnOrAfterDateInactive(iso, selected.dateInactive)
    ) {
      const next = clampIsoToWindow(today, minIso, maxIso);
      setSelectedIso(next);
      setCalStart(windowForIso(next, minIso, maxIso));
      return;
    }
    const next =
      keepExisting || dayCreated(iso)
        ? iso
        : clampIsoToWindow(iso, minIso, maxIso);
    setSelectedIso(next);
    setCalStart(windowForIso(next, minIso, maxIso));
  }

  function dayCreated(iso: string, org: Org | null = selected) {
    if (!org || !iso) return false;
    const map = days[org.id];
    if (!map) return false;
    const key = iso.slice(0, 10);
    return Object.hasOwn(map, key) || Object.hasOwn(map, iso);
  }

  // Newest created day in the logging window, including an empty shell.
  function mostRecentLogIso(org: Org) {
    const map = days[org.id];
    if (!map) return "";
    const { minIso, maxIso } = rangeOf(org);
    let latest = "";
    for (const iso of Object.keys(map)) {
      if (!iso || iso > today || iso < minIso || iso > maxIso) continue;
      if (isBeforeArchiveStart(iso, settings.archiveStartDate)) continue;
      if (iso > latest) latest = iso;
    }
    return latest;
  }

  function requestDay(iso: string) {
    if (!selected || !iso || !selected.dateActive) return;
    if (isBeforeArchiveStart(iso, settings.archiveStartDate)) return;
    if (isOnOrAfterDateInactive(iso, selected.dateInactive)) return;
    // A stored day before Date Active stays openable. Search, Overview, and
    // ChiveBot still omit it.
    if (dayCreated(iso)) {
      setPendingCreateIso(null);
      selectDay(iso, true);
      return;
    }
    const { minIso, maxIso } = rangeOf(selected);
    if (iso < minIso || iso > maxIso) return;
    if (
      !isCreatableDay(
        iso,
        settings.archiveStartDate,
        selected.dateActive,
        selected.dateInactive,
        today,
      )
    ) {
      return;
    }
    setPendingCreateIso(iso);
  }

  function cancelCreate() {
    setPendingCreateIso(null);
  }

  function confirmCreate() {
    if (!selected || !pendingCreateIso || !selected.dateActive) return;
    const iso = pendingCreateIso;
    if (
      !isCreatableDay(
        iso,
        settings.archiveStartDate,
        selected.dateActive,
        selected.dateInactive,
        today,
      )
    ) {
      setPendingCreateIso(null);
      return;
    }
    createDay(selected.id, iso);
    setPendingCreateIso(null);
    selectDay(iso);
  }

  if (selectedId && (!orgs.length || !orgs.some((org) => org.id === selectedId))) {
    setSelectedId(null);
    if (awaitingDate) setAwaitingDate(false);
  } else if (!selectedId && awaitingDate) {
    setAwaitingDate(false);
  }

  if (pendingForId !== selectedId) {
    setPendingForId(selectedId);
    if (pendingCreateIso !== null) setPendingCreateIso(null);
  }

  if (settings.archiveStartDate !== syncedArchiveStart) {
    setSyncedArchiveStart(settings.archiveStartDate);
    if (selected) {
      const { minIso, maxIso } = rangeOf(selected);
      setPendingCreateIso(null);
      const next = clampIsoToWindow(today, minIso, maxIso);
      setSelectedIso(next);
      setCalStart(windowForIso(next, minIso, maxIso));
    }
  } else if (
    selected &&
    (isBeforeArchiveStart(selectedIso, settings.archiveStartDate) ||
      isOnOrAfterDateInactive(selectedIso, selected.dateInactive))
  ) {
    const { minIso, maxIso } = rangeOf(selected);
    setPendingCreateIso(null);
    const next = clampIsoToWindow(today, minIso, maxIso);
    setSelectedIso(next);
    setCalStart(windowForIso(next, minIso, maxIso));
  } else if (selectedIso > today) {
    if (selected) {
      const { minIso, maxIso } = rangeOf(selected);
      setPendingCreateIso(null);
      const next = clampIsoToWindow(today, minIso, maxIso);
      setSelectedIso(next);
      setCalStart(windowForIso(next, minIso, maxIso));
    } else {
      setSelectedIso(today);
      setCalStart(windowForIso(today));
    }
  }
  if (pendingCreateIso && pendingCreateIso > today) {
    setPendingCreateIso(null);
  }

  if (selectedId && selectedId !== lastSelectedId) {
    setLastSelectedId(selectedId);
  }

  const queryKey = queryOrg ? `${queryOrg}:${queryIso ?? ""}` : "";
  if (!queryOrg) {
    if (dismissedQuery) setDismissedQuery("");
    if (appliedQuery) setAppliedQuery("");
  }
  if (queryOrg && orgs.length) {
    const org = orgs.find((item) => item.id === queryOrg);
    if (org) {
      const firstLand = appliedQuery !== queryKey;
      const listed =
        (!org.hidden || showHidden) &&
        orgMatchesStatus(org, orgStatus, today);
      const reopen =
        !firstLand &&
        !selectedId &&
        listed &&
        lastSelectedId === queryOrg &&
        dismissedQuery !== queryKey;
      if (firstLand || reopen) {
        const { minIso, maxIso } = orgRange(
          org,
          settings.archiveStartDate,
          today,
        );
        const bounded = queryIso ?? today;
        const existing =
          queryIso &&
          dayCreated(queryIso, org) &&
          !isBeforeArchiveStart(queryIso, settings.archiveStartDate) &&
          !isOnOrAfterDateInactive(queryIso, org.dateInactive)
            ? queryIso
            : "";
        const next = existing || clampIsoToWindow(bounded, minIso, maxIso);
        if (firstLand) {
          setAppliedQuery(queryKey);
          if (org.hidden) setShowHidden(true);
          if (!orgMatchesStatus(org, orgStatus, today)) setOrgStatus("all");
        }
        setPendingCreateIso(null);
        setSelectedId(org.id);
        setSelectedIso(next);
        setCalStart(windowForIso(next, minIso, maxIso));
        setAwaitingDate(Boolean(org.dateActive) && !existing);
      }
    }
  }

  useEffect(() => {
    if (!pendingCreateIso) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPendingCreateIso(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingCreateIso]);

  function shiftWindow(delta: number) {
    setCalStart((current) => addMonths(current.year, current.month, delta));
  }

  const visibleOrgs = filterOrgList(orgs, { showHidden, orgStatus, today });
  const sortedOrgs = sortOrgs(visibleOrgs, sortOrder);

  const day = selected ? getDay(selected.id, selectedIso) : null;
  const missingDateActive = Boolean(selected && !selected.dateActive);
  const pickingDate = Boolean(awaitingDate && selected && selected.dateActive);
  const selectedRange = selected ? rangeOf(selected) : null;
  const recentLogIso = selected ? mostRecentLogIso(selected) : "";
  const emptyLogIsos = (() => {
    if (!selected) return [];
    const map = days[selected.id];
    if (!map) return [];
    const { minIso, maxIso } = rangeOf(selected);
    return Object.keys(map)
      .filter((iso) => {
        if (!iso || iso > today || iso < minIso || iso > maxIso) return false;
        if (isBeforeArchiveStart(iso, settings.archiveStartDate)) {
          return false;
        }
        return isBlankDay(map[iso]);
      })
      .sort((a, b) => b.localeCompare(a));
  })();
  const canOpenToday = Boolean(
    selected &&
      selectedRange &&
      today >= selectedRange.minIso &&
      today <= selectedRange.maxIso &&
      (dayCreated(today) ||
        isCreatableDay(
          today,
          settings.archiveStartDate,
          selected.dateActive,
          selected.dateInactive,
          today,
        )),
  );
  return (
    <div className="page-cols">
      <div className="org-layout">
        <aside
          className={`org-sidebar${dbError || noOrgs ? " is-inert" : ""}`}
          inert={dbError || noOrgs || undefined}
        >
          <OrgPicker
            orgs={sortedOrgs}
            selectedId={selected?.id ?? null}
            sortOrder={sortOrder}
            showHidden={showHidden}
            orgStatus={orgStatus}
            onSort={setSortOrder}
            onShowHidden={setShowHidden}
            onOrgStatus={setOrgStatus}
            onSelect={selectOrg}
          />
        </aside>
        <section
          className={`org-day${selected && !missingDateActive && !pickingDate && day ? "" : " org-day-empty"}`}
          aria-label="Day"
        >
          <header className="day-heading">
            {selected ? (
              <>
                {!missingDateActive && !pickingDate ? (
                  <ThemeDateField
                    variant="heading"
                    value={selectedIso}
                    min={rangeOf(selected).minIso}
                    until={rangeOf(selected).untilIso}
                    today={today}
                    aria-label={`Select a date for ${selected.name}. Current: ${formatDayTitle(selectedIso)}`}
                    onChange={requestDay}
                  >
                    {formatDayTitle(selectedIso)}
                  </ThemeDateField>
                ) : null}
                <OrgNameMenu
                  name={selected.name}
                  orgs={sortedOrgs}
                  selectedId={selected.id}
                  sortOrder={sortOrder}
                  orgStatus={orgStatus}
                  showHidden={showHidden}
                  onSort={setSortOrder}
                  onOrgStatus={setOrgStatus}
                  onShowHidden={setShowHidden}
                  onSelect={selectOrg}
                />
              </>
            ) : (
              <h1 className="page-title">Archive</h1>
            )}
          </header>
          <div className="org-day-body">
            {missingDateActive && selected ? (
              <EmptyBody
                kicker=""
                copy={`${selected.name} has no Date Active defined.`}
                action={
                  <SetDateActiveLink
                    href={organizationEditHref(selected.id)}
                    name={selected.name}
                  />
                }
              />
            ) : pickingDate && selected && selectedRange ? (
              <div className="org-date-picker">
                <aside className="org-empty-logs" aria-label="Empty Logs">
                  <h2>Empty Logs</h2>
                  {emptyLogIsos.length ? (
                    <nav className="org-sidebar-nav" aria-label="Empty logs">
                      {emptyLogIsos.map((iso) => (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => selectDay(iso, true)}
                        >
                          {formatDayTitle(iso)}
                        </button>
                      ))}
                    </nav>
                  ) : (
                    <p className="org-empty-logs-none">No empty logs.</p>
                  )}
                </aside>
                <div className="org-date-picker-split" aria-hidden="true" />
                <div className="org-date-picker-main">
                  <div className="org-date-picker-actions">
                    <button
                      type="button"
                      className="plus-btn"
                      disabled={!canOpenToday}
                      onClick={() => requestDay(today)}
                    >
                      Open Today
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      disabled={!recentLogIso}
                      onClick={() => {
                        if (recentLogIso) selectDay(recentLogIso, true);
                      }}
                    >
                      Open Most Recent
                    </button>
                  </div>
                  <CalendarPanel
                    startYear={calStart.year}
                    startMonth={calStart.month}
                    selectedIso=""
                    minIso={selectedRange.minIso}
                    maxIso={selectedRange.maxIso}
                    untilIso={selectedRange.untilIso}
                    archiveStartDate={settings.archiveStartDate}
                    dateActive={selected.dateActive}
                    dateInactive={selected.dateInactive}
                    today={today}
                    windowSize={PICKER_WINDOW}
                    columns={3}
                    onSelect={requestDay}
                    onPrev={() => shiftWindow(-PICKER_WINDOW)}
                    onNext={() => shiftWindow(PICKER_WINDOW)}
                    onStartChange={(year, month) => setCalStart({ year, month })}
                    createdDays={days[selected.id] ?? {}}
                    orgSelected
                  />
                </div>
              </div>
            ) : selected &&
            day &&
            dayCreated(selectedIso) &&
            !isBeforeArchiveStart(selectedIso, settings.archiveStartDate) &&
            !isOnOrAfterDateInactive(selectedIso, selected.dateInactive) ? (
              <DayPanel
                iso={selectedIso}
                orgName={selected.name}
                entryHref={archiveDayHref(selected.id, selectedIso)}
                day={day}
                onChange={(next) => setDay(selected.id, selectedIso, next)}
                onUploadFile={(file, rowId) =>
                  uploadAttachment({
                    orgId: selected.id,
                    iso: selectedIso,
                    rowId,
                    file,
                  })
                }
                attachmentHref={attachmentHref}
                onDeleteDay={() => {
                  removeDay(selected.id, selectedIso);
                  setAwaitingDate(true);
                }}
              />
            ) : dbError ? (
              <ErrorBody />
            ) : orgs.length === 0 ? (
              <EmptyBody
                action={
                  addHref ? <AddOrganizationLink href={addHref} /> : undefined
                }
              />
            ) : !selected ? (
              <>
                <div className="org-landing-picker">
                  <OrgPicker
                    orgs={sortedOrgs}
                    selectedId={null}
                    sortOrder={sortOrder}
                    showHidden={showHidden}
                    orgStatus={orgStatus}
                    onSort={setSortOrder}
                    onShowHidden={setShowHidden}
                    onOrgStatus={setOrgStatus}
                    onSelect={selectOrg}
                    parts="list"
                  />
                </div>
                <p className="org-empty-prompt">
                  Select an organization to begin.
                </p>
              </>
            ) : null}
          </div>
        </section>
        <section
          className={`org-calendar${dbError || noOrgs || missingDateActive ? " is-inert" : ""}`}
          aria-label="Calendar"
          inert={dbError || noOrgs || missingDateActive || undefined}
        >
          <CalendarPanel
            startYear={calStart.year}
            startMonth={calStart.month}
            selectedIso={selectedIso}
            minIso={selected ? rangeOf(selected).minIso : settings.archiveStartDate || today}
            maxIso={selected ? rangeOf(selected).maxIso : today}
            untilIso={selected ? rangeOf(selected).untilIso : undefined}
            archiveStartDate={settings.archiveStartDate}
            dateActive={selected?.dateActive}
            dateInactive={selected?.dateInactive}
            today={today}
            onSelect={requestDay}
            onPrev={() => shiftWindow(-CAL_WINDOW)}
            onNext={() => shiftWindow(CAL_WINDOW)}
            onStartChange={(year, month) => setCalStart({ year, month })}
            createdDays={selected ? days[selected.id] : undefined}
            orgSelected={Boolean(selected?.dateActive)}
          />
        </section>
      </div>
      {selected ? null : (
        <MobileFilters disabled={dbError || noOrgs}>
          <OrgPicker
            orgs={sortedOrgs}
            selectedId={null}
            sortOrder={sortOrder}
            showHidden={showHidden}
            orgStatus={orgStatus}
            onSort={setSortOrder}
            onShowHidden={setShowHidden}
            onOrgStatus={setOrgStatus}
            onSelect={selectOrg}
            parts="controls"
          />
        </MobileFilters>
      )}
      {pendingCreateIso ? (
        <ModalShell onClose={cancelCreate}>
          <div
            className="modal create-entry-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-entry-title"
          >
            <header className="modal-head">
              <h2 id="create-entry-title" className="modal-title">
                Create Entry for {selected?.name}
              </h2>
              <button
                type="button"
                className="icon-btn modal-close"
                aria-label="Close"
                onClick={cancelCreate}
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
            </header>
            <p className="modal-copy">{formatDayTitle(pendingCreateIso)}</p>
            <div className="modal-actions">
              <button type="button" className="text-link" onClick={cancelCreate}>
                Cancel
              </button>
              <button type="button" className="text-btn" onClick={confirmCreate}>
                Create
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
