"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CopyableUrlField } from "./CopyableUrlField";
import { NotesEditor } from "./NotesEditor";
import { ModalShell } from "./ModalShell";
import {
  ATTENDANCE_OPTIONS,
  RATING_FACES,
  emptyDay,
  formatDayTitle,
  isBlankDay,
  type ArtifactRow,
  type DayEntry,
  type WorkRow,
} from "../lib/data";

const DAY_TABS = [
  { id: "attendance", label: "Attendance" },
  { id: "work", label: "Work" },
  { id: "citations", label: "Citations" },
  { id: "notes", label: "Notes" },
  { id: "rating", label: "Rating" },
  { id: "comments", label: "Comments" },
  { id: "manage", label: "Manage" },
] as const;

type DayTab = (typeof DAY_TABS)[number]["id"];

function newId() {
  return `row-${Math.random().toString(36).slice(2, 9)}`;
}

function reorderById<T extends { id: string }>(
  list: T[],
  fromId: string,
  toId: string,
) {
  const from = list.findIndex((item) => item.id === fromId);
  const to = list.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

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

function DragHandle() {
  return (
    <span className="drag-handle" aria-hidden="true">
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
        <circle cx="2.5" cy="2.5" r="1.15" />
        <circle cx="7.5" cy="2.5" r="1.15" />
        <circle cx="2.5" cy="8" r="1.15" />
        <circle cx="7.5" cy="8" r="1.15" />
        <circle cx="2.5" cy="13.5" r="1.15" />
        <circle cx="7.5" cy="13.5" r="1.15" />
      </svg>
    </span>
  );
}

function SortableRows<T extends { id: string }>({
  items,
  listId,
  lockedId,
  onReorder,
  renderItem,
}: {
  items: T[];
  listId: string;
  lockedId?: string | null;
  onReorder: (next: T[]) => void;
  renderItem: (item: T) => ReactNode;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  return (
    <ul className="day-rows">
      {items.map((item) => {
        const locked = lockedId === item.id;
        const dragging = draggingId === item.id;
        const over = overId === item.id && draggingId !== item.id;
        return (
          <li
            key={item.id}
            draggable={!locked}
            className={`${dragging ? "is-dragging" : ""}${over ? " is-over" : ""}${locked ? " is-editing" : ""}`.trim()}
            onDragStart={(event) => {
              const target = event.target as HTMLElement;
              if (locked || target.closest("button, a, input, textarea, label")) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.setData("text/plain", `${listId}:${item.id}`);
              event.dataTransfer.effectAllowed = "move";
              setDraggingId(item.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (overId !== item.id) setOverId(item.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const payload = event.dataTransfer.getData("text/plain");
              const prefix = `${listId}:`;
              if (!payload.startsWith(prefix)) return;
              const fromId = payload.slice(prefix.length);
              onReorder(reorderById(items, fromId, item.id));
              setDraggingId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setOverId(null);
            }}
          >
            {renderItem(item)}
          </li>
        );
      })}
    </ul>
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="day-row-actions">
      <button
        type="button"
        className="icon-btn"
        aria-label="Delete"
        onClick={onDelete}
      >
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
      </button>
      <button
        type="button"
        className="icon-btn icon-edit"
        aria-label="Edit"
        onClick={onEdit}
      >
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
      </button>
    </div>
  );
}

function UrlIcon() {
  return (
    <svg
      className="url-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="url-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4v11"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8 11.5 12 16l4-4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DayPanel({
  iso,
  orgName,
  entryHref,
  day,
  onChange,
  onDeleteDay,
  onUploadFile,
  attachmentHref,
}: {
  iso: string;
  orgName: string;
  entryHref: string;
  day: DayEntry;
  onChange: (next: DayEntry) => void;
  onDeleteDay: () => void;
  onUploadFile?: (
    file: File,
    rowId: string,
  ) => Promise<{ key: string; name: string } | null>;
  attachmentHref?: (key: string, name: string) => string;
}) {
  const [workDraft, setWorkDraft] = useState({
    title: "",
    description: "",
    link: "",
  });
  const [artifactDraft, setArtifactDraft] = useState({
    title: "",
    url: "",
    attachment: "",
    attachmentKey: "",
  });
  const [addingWork, setAddingWork] = useState(false);
  const [addingArtifact, setAddingArtifact] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "work"; id: string; title: string }
    | { kind: "artifact"; id: string; title: string }
    | null
  >(null);
  const [pendingManage, setPendingManage] = useState<"clear" | "delete" | null>(
    null,
  );
  const [pendingAttachment, setPendingAttachment] = useState<
    "replace" | "delete" | null
  >(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const artifactFile = useRef<File | null>(null);
  const replacingAttachment = useRef(false);
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [notesDraft, setNotesDraft] = useState(day.notes);
  const [commentsDraft, setCommentsDraft] = useState(day.comments);
  const [ratingDraft, setRatingDraft] = useState(day.rating);
  const [attendanceDraft, setAttendanceDraft] = useState(day.attendance);
  const [tab, setTab] = useState<DayTab>("attendance");
  const dayStamp = `${iso}\0${day.notes}\0${day.comments}\0${day.rating}\0${day.attendance}`;
  const [syncedStamp, setSyncedStamp] = useState(dayStamp);
  if (dayStamp !== syncedStamp) {
    setSyncedStamp(dayStamp);
    setNotesDraft(day.notes);
    setCommentsDraft(day.comments);
    setRatingDraft(day.rating);
    setAttendanceDraft(day.attendance);
    setTab("attendance");
  }

  useEffect(() => {
    if (!pendingDelete && !pendingManage && !pendingAttachment) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingDelete(null);
        setPendingManage(null);
        setPendingAttachment(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, pendingManage, pendingAttachment]);

  function resetWorkDraft() {
    setWorkDraft({ title: "", description: "", link: "" });
  }

  function resetArtifactDraft() {
    setArtifactDraft({ title: "", url: "", attachment: "", attachmentKey: "" });
    artifactFile.current = null;
    replacingAttachment.current = false;
    if (attachmentInput.current) attachmentInput.current.value = "";
  }

  function startAddWork() {
    setEditingWorkId(null);
    resetWorkDraft();
    setAddingWork(true);
  }

  function startEditWork(row: WorkRow) {
    setAddingWork(false);
    setEditingWorkId(row.id);
    setWorkDraft({
      title: row.title,
      description: row.description,
      link: row.link,
    });
  }

  function cancelWork() {
    setAddingWork(false);
    setEditingWorkId(null);
    resetWorkDraft();
  }

  function saveWork() {
    if (!workDraft.title.trim()) return;
    if (editingWorkId) {
      onChange({
        ...day,
        work: day.work.map((row) =>
          row.id === editingWorkId ? { ...row, ...workDraft } : row,
        ),
      });
    } else {
      onChange({
        ...day,
        work: [...day.work, { id: newId(), ...workDraft }],
      });
    }
    cancelWork();
  }

  function startAddArtifact() {
    setEditingArtifactId(null);
    resetArtifactDraft();
    setAddingArtifact(true);
  }

  function startEditArtifact(row: ArtifactRow) {
    setAddingArtifact(false);
    setEditingArtifactId(row.id);
    setArtifactDraft({
      title: row.title,
      url: row.url,
      attachment: row.attachment,
      attachmentKey: row.attachmentKey ?? "",
    });
    artifactFile.current = null;
    replacingAttachment.current = false;
  }

  function cancelArtifact() {
    setAddingArtifact(false);
    setEditingArtifactId(null);
    setPendingAttachment(null);
    resetArtifactDraft();
  }

  function clearArtifactAttachment() {
    artifactFile.current = null;
    if (attachmentInput.current) attachmentInput.current.value = "";
    setArtifactDraft((current) => ({
      ...current,
      attachment: "",
      attachmentKey: "",
    }));
  }

  function requestDeleteAttachment() {
    if (savingArtifact) return;
    if (!artifactDraft.attachment && !artifactDraft.attachmentKey) return;
    setPendingAttachment("delete");
  }

  function confirmDeleteAttachment() {
    const rowId = editingArtifactId;
    const hadStoredFile = Boolean(
      rowId &&
        day.artifacts.some(
          (item) =>
            item.id === rowId && (item.attachment || item.attachmentKey),
        ),
    );
    setPendingAttachment(null);
    clearArtifactAttachment();
    if (!rowId || !hadStoredFile) return;
    onChange({
      ...day,
      artifacts: day.artifacts.map((item) =>
        item.id === rowId
          ? { ...item, attachment: "", attachmentKey: "" }
          : item,
      ),
    });
  }

  function openAttachmentPicker() {
    if (attachmentInput.current) attachmentInput.current.value = "";
    attachmentInput.current?.click();
  }

  function requestAttachmentPick() {
    if (savingArtifact) return;
    if (artifactDraft.attachment || artifactDraft.attachmentKey) {
      setPendingAttachment("replace");
      return;
    }
    openAttachmentPicker();
  }

  function confirmReplaceAttachment() {
    replacingAttachment.current = true;
    openAttachmentPicker();
    setPendingAttachment(null);
  }

  async function saveArtifact() {
    if (!artifactDraft.title.trim() || savingArtifact) return;
    const rowId = editingArtifactId ?? newId();
    let nextDraft = { ...artifactDraft };
    const file = artifactFile.current;
    if (file && onUploadFile) {
      setSavingArtifact(true);
      const uploaded = await onUploadFile(file, rowId);
      setSavingArtifact(false);
      if (uploaded) {
        nextDraft = {
          ...nextDraft,
          attachment: uploaded.name,
          attachmentKey: uploaded.key,
        };
      }
    }
    const row = { id: rowId, ...nextDraft };
    if (editingArtifactId) {
      onChange({
        ...day,
        artifacts: day.artifacts.map((item) =>
          item.id === editingArtifactId ? { ...item, ...row } : item,
        ),
      });
    } else {
      onChange({
        ...day,
        artifacts: [...day.artifacts, row],
      });
    }
    cancelArtifact();
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "work") {
      if (editingWorkId === pendingDelete.id) cancelWork();
      onChange({
        ...day,
        work: day.work.filter((row) => row.id !== pendingDelete.id),
      });
    } else {
      if (editingArtifactId === pendingDelete.id) cancelArtifact();
      onChange({
        ...day,
        artifacts: day.artifacts.filter((row) => row.id !== pendingDelete.id),
      });
    }
    setPendingDelete(null);
  }

  function workForm() {
    return (
      <form
        className="day-form"
        onSubmit={(event) => {
          event.preventDefault();
          saveWork();
        }}
      >
        <input
          className="app-field"
          placeholder="Title"
          value={workDraft.title}
          onChange={(event) =>
            setWorkDraft((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
        <textarea
          className="app-field"
          placeholder="Description"
          rows={3}
          value={workDraft.description}
          onChange={(event) =>
            setWorkDraft((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
        <input
          className="app-field"
          placeholder="Link"
          value={workDraft.link}
          onChange={(event) =>
            setWorkDraft((current) => ({
              ...current,
              link: event.target.value,
            }))
          }
        />
        <div className="day-form-actions">
          <button type="button" className="text-link" onClick={cancelWork}>
            Cancel
          </button>
          <button type="submit" className="text-btn">
            Save
          </button>
        </div>
      </form>
    );
  }

  const artifactFormEl = (
      <form
        className="day-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveArtifact();
        }}
      >
        <input
          className="app-field"
          placeholder="Title"
          value={artifactDraft.title}
          onChange={(event) =>
            setArtifactDraft((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
        <input
          className="app-field"
          placeholder="URL"
          value={artifactDraft.url}
          onChange={(event) =>
            setArtifactDraft((current) => ({
              ...current,
              url: event.target.value,
            }))
          }
        />
        <div className="file-upload">
          <input
            ref={attachmentInput}
            className="sr-only"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              const replacing = replacingAttachment.current;
              replacingAttachment.current = false;
              artifactFile.current = file;
              setArtifactDraft((current) => ({
                ...current,
                attachment: file?.name ?? current.attachment,
              }));
              if (file && replacing) {
                void saveArtifact();
              }
            }}
          />
          <button
            type="button"
            className="plus-btn"
            disabled={savingArtifact}
            onClick={requestAttachmentPick}
          >
            {artifactDraft.attachment || artifactDraft.attachmentKey
              ? "Replace Attachment"
              : "Upload Attachment"}
          </button>
          {artifactDraft.attachment ? (
            <span className="file-upload-file">
              <span className="file-upload-name">{artifactDraft.attachment}</span>
              <button
                type="button"
                className="icon-btn file-upload-remove"
                aria-label="Delete attachment"
                disabled={savingArtifact}
                onClick={requestDeleteAttachment}
              >
                <svg
                  width="16"
                  height="16"
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
            </span>
          ) : null}
        </div>
        <div className="day-form-actions">
          <button type="button" className="text-link" onClick={cancelArtifact}>
            Cancel
          </button>
          <button
            type="submit"
            className="text-btn"
            disabled={savingArtifact}
            aria-busy={savingArtifact}
          >
            {savingArtifact ? "Uploading attachment ..." : "Save"}
          </button>
        </div>
      </form>
  );

  return (
    <article className="col-copy day-panel">
      <div className="day-tabs" role="tablist" aria-label="Day sections">
        {DAY_TABS.map((item) => (
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

      <section className={`day-section${tab === "attendance" ? " is-active" : ""}`}>
        <h3>Attendance</h3>
        <div
          className="view-toggle attendance-toggle"
          role="group"
          aria-label="Attendance"
        >
          {ATTENDANCE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={attendanceDraft === option.id ? "is-active" : undefined}
              aria-pressed={attendanceDraft === option.id}
              onClick={() =>
                setAttendanceDraft((current) =>
                  current === option.id ? null : option.id,
                )
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="day-form-actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setAttendanceDraft(day.attendance)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => onChange({ ...day, attendance: attendanceDraft })}
          >
            Save
          </button>
        </div>
      </section>

      <section className={`day-section${tab === "work" ? " is-active" : ""}`}>
        <header className="day-section-head">
          <h3>Work Completed</h3>
          <button
            type="button"
            className="plus-btn add-row-link"
            onClick={startAddWork}
          >
            + Add Work
          </button>
        </header>
        {day.work.length === 0 && !addingWork ? (
          <p className="empty-inline">No work logged.</p>
        ) : (
          <SortableRows
            items={day.work}
            listId="work"
            lockedId={editingWorkId}
            onReorder={(work) => onChange({ ...day, work })}
            renderItem={(row) =>
              editingWorkId === row.id ? (
                workForm()
              ) : (
                <div className="day-row-head">
                  <DragHandle />
                  <div className="day-row-copy">
                    <div className="day-row-title-line">
                      <strong className="day-work-title">{row.title}</strong>
                      <RowActions
                        onEdit={() => startEditWork(row)}
                        onDelete={() =>
                          setPendingDelete({
                            kind: "work",
                            id: row.id,
                            title: row.title,
                          })
                        }
                      />
                    </div>
                    {row.description ? (
                      <p className="day-row-detail">{row.description}</p>
                    ) : null}
                    {row.link ? (
                      <p className="day-row-detail day-row-link">
                        <UrlIcon />
                        <a
                          href={row.link}
                          target="_blank"
                          rel="noreferrer"
                          draggable={false}
                        >
                          {row.link}
                        </a>
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            }
          />
        )}
        {addingWork ? workForm() : null}
      </section>

      <section className={`day-section${tab === "citations" ? " is-active" : ""}`}>
        <header className="day-section-head">
          <h3>Citations / Artifacts</h3>
          <button
            type="button"
            className="plus-btn add-row-link"
            onClick={startAddArtifact}
          >
            + Add Citation / Artifact
          </button>
        </header>
        {day.artifacts.length === 0 && !addingArtifact ? (
          <p className="empty-inline">No citations or artifacts.</p>
        ) : (
          <SortableRows
            items={day.artifacts}
            listId="artifacts"
            lockedId={editingArtifactId}
            onReorder={(artifacts) => onChange({ ...day, artifacts })}
            renderItem={(row) =>
              editingArtifactId === row.id ? (
                artifactFormEl
              ) : (
                <div className="day-row-head">
                  <DragHandle />
                  <div className="day-row-copy">
                    <div className="day-row-title-line">
                      <strong className="day-work-title">{row.title}</strong>
                      <RowActions
                        onEdit={() => startEditArtifact(row)}
                        onDelete={() =>
                          setPendingDelete({
                            kind: "artifact",
                            id: row.id,
                            title: row.title,
                          })
                        }
                      />
                    </div>
                    {row.url ? (
                      <p className="day-row-detail day-row-link">
                        <UrlIcon />
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          draggable={false}
                        >
                          {row.url}
                        </a>
                      </p>
                    ) : null}
                    {row.attachment ? (
                      <p className="day-row-detail day-row-link">
                        <DownloadIcon />
                        {row.attachmentKey && attachmentHref ? (
                          <a
                            href={attachmentHref(
                              row.attachmentKey,
                              row.attachment,
                            )}
                            draggable={false}
                          >
                            {row.attachment}
                          </a>
                        ) : (
                          <span>{row.attachment}</span>
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            }
          />
        )}
        {addingArtifact ? artifactFormEl : null}
      </section>

      <section className={`day-section${tab === "notes" ? " is-active" : ""}`}>
        <h3>Notes</h3>
        <NotesEditor
          key={`${iso}-notes`}
          title="Notes"
          rows={4}
          value={notesDraft}
          placeholder="Enter work-related notes for this day."
          onChange={setNotesDraft}
          onCancel={() => setNotesDraft(day.notes)}
          onSave={() => onChange({ ...day, notes: notesDraft })}
        />
        <div className="day-form-actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setNotesDraft(day.notes)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => onChange({ ...day, notes: notesDraft })}
          >
            Save
          </button>
        </div>
      </section>

      <section className={`day-section${tab === "rating" ? " is-active" : ""}`}>
        <header className="day-section-head rating-head">
          <h3>Rating</h3>
          <div className="rating-faces" role="group" aria-label="Day rating">
            {RATING_FACES.map((face) => (
              <button
                key={face.value}
                type="button"
                className={ratingDraft === face.value ? "is-active" : undefined}
                aria-pressed={ratingDraft === face.value}
                aria-label={`${face.value}, ${face.label}`}
                onClick={() => setRatingDraft(face.value)}
              >
                <span className="rating-face-label">{face.label}</span>
                <span className="rating-face-emoji" aria-hidden="true">
                  {face.face}
                </span>
              </button>
            ))}
          </div>
        </header>
        <div className="day-form-actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setRatingDraft(day.rating)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => onChange({ ...day, rating: ratingDraft })}
          >
            Save
          </button>
        </div>
      </section>

      <section className={`day-section${tab === "comments" ? " is-active" : ""}`}>
        <h3>Comments</h3>
        <NotesEditor
          key={`${iso}-comments`}
          title="Comments"
          rows={3}
          value={commentsDraft}
          placeholder="Enter other comments for this day."
          onChange={setCommentsDraft}
          onCancel={() => setCommentsDraft(day.comments)}
          onSave={() => onChange({ ...day, comments: commentsDraft })}
        />
        <div className="day-form-actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setCommentsDraft(day.comments)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => onChange({ ...day, comments: commentsDraft })}
          >
            Save
          </button>
        </div>
      </section>

      <section className={`day-section${tab === "manage" ? " is-active" : ""}`}>
        <h3>Manage</h3>
        <div className="day-manage-row">
          <CopyableUrlField
            href={entryHref}
            copyLabel="Copy Entry URL"
            aria-label="Day entry URL"
          />
          <div className="org-heading-actions day-manage-actions">
            <button
              type="button"
              className="plus-btn"
              disabled={isBlankDay(day)}
              onClick={() => setPendingManage("clear")}
            >
              Clear All
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => setPendingManage("delete")}
            >
              Delete Day
            </button>
          </div>
        </div>
      </section>
      {pendingManage ? (
        <ModalShell onClose={() => setPendingManage(null)}>
          <div
            className="modal create-entry-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-day-title"
            aria-describedby="manage-day-warn"
          >
            <header className="modal-head">
              <h2 id="manage-day-title" className="modal-title">
                {pendingManage === "clear"
                  ? `Clear ${orgName} Data`
                  : `Delete ${orgName} Day`}
              </h2>
              <ModalClose onClick={() => setPendingManage(null)} />
            </header>
            <p id="manage-day-warn" className="modal-permanent">
              THIS ACTION IS PERMANENT AND CANNOT BE UNDONE.
            </p>
            <p className="modal-copy">{formatDayTitle(iso)}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="text-link"
                onClick={() => setPendingManage(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={pendingManage === "clear" ? "plus-btn" : "text-btn"}
                onClick={() => {
                  if (pendingManage === "clear") onChange(emptyDay());
                  else onDeleteDay();
                  setPendingManage(null);
                }}
              >
                {pendingManage === "clear" ? "Clear" : "Delete"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      {pendingAttachment ? (
        <ModalShell onClose={() => setPendingAttachment(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attachment-action-title"
            aria-describedby="attachment-action-warn"
          >
            <h2 id="attachment-action-title" className="modal-title">
              {pendingAttachment === "replace"
                ? "Replace this attachment?"
                : "Delete this attachment?"}
            </h2>
            <p id="attachment-action-warn" className="modal-permanent">
              THIS ACTION IS PERMANENT AND CANNOT BE UNDONE.
            </p>
            <p className="modal-copy">
              {pendingAttachment === "replace" ? "Replacing" : "Deleting"}{" "}
              removes{" "}
              <strong>
                {artifactDraft.attachment.trim() || "this file"}
              </strong>{" "}
              from this entry.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="text-link"
                onClick={() => setPendingAttachment(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={
                  pendingAttachment === "replace"
                    ? confirmReplaceAttachment
                    : confirmDeleteAttachment
                }
              >
                {pendingAttachment === "replace" ? "Replace" : "Delete"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      {pendingDelete ? (
        <ModalShell onClose={() => setPendingDelete(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-entry-title"
            aria-describedby="delete-entry-warn"
          >
            <h2 id="delete-entry-title" className="modal-title">
              Delete this{" "}
              {pendingDelete.kind === "work"
                ? "work"
                : "citation / artifact"}{" "}
              entry?
            </h2>
            <p id="delete-entry-warn" className="modal-permanent">
              THIS ACTION IS PERMANENT AND CANNOT BE UNDONE.
            </p>
            <p className="modal-copy">{pendingDelete.title}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="text-link"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button type="button" className="text-btn" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </article>
  );
}
