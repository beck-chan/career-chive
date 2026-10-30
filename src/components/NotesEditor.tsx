"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "@/lib/theme";
import { ModalShell } from "@/components/ModalShell";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import { mergeRegister } from "@lexical/utils";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import {
  $isListNode,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  HEADING,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  UNORDERED_LIST,
} from "@lexical/markdown";

const NOTE_TRANSFORMERS = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
];

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "bullet" | "quote";
type HeadingOption = "paragraph" | "h1" | "h2" | "h3";

const BLOCK_OPTIONS: { type: HeadingOption; label: string }[] = [
  { type: "paragraph", label: "Normal" },
  { type: "h1", label: "Heading 1" },
  { type: "h2", label: "Heading 2" },
  { type: "h3", label: "Heading 3" },
];

function $loadMarkdown(markdown: string) {
  $convertFromMarkdownString(markdown, NOTE_TRANSFORMERS);
  const root = $getRoot();
  if (root.getFirstChild() === null) {
    root.append($createParagraphNode());
  }
}

function normalizeMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

function $selectedLinkUrl() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const node = selection.anchor.getNode();
  if ($isLinkNode(node)) return node.getURL();
  const parent = node.getParent();
  if ($isLinkNode(parent)) return parent.getURL();
  return null;
}

function normalizeLinkUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isAllowedLink(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return url.startsWith("/") || url.startsWith("#");
  }
}

function MarkdownSyncPlugin({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const last = useRef(normalizeMarkdown(value));
  const applying = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const next = normalizeMarkdown(value);
    if (next === last.current) return;
    applying.current = true;
    last.current = next;
    editor.update(
      () => {
        $loadMarkdown(next);
      },
      {
        onUpdate: () => {
          applying.current = false;
        },
      },
    );
  }, [editor, value]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      if (applying.current) return;
      editorState.read(() => {
        const markdown = normalizeMarkdown(
          $convertToMarkdownString(NOTE_TRANSFORMERS),
        );
        if (markdown === last.current) return;
        last.current = markdown;
        onChangeRef.current(markdown);
      });
    });
  }, [editor]);

  return null;
}

function $currentBlockType(): BlockType {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "paragraph";
  const element = selection.anchor.getNode().getTopLevelElementOrThrow();
  if ($isListNode(element)) return "bullet";
  if ($isHeadingNode(element)) {
    const tag = element.getTag();
    if (tag === "h1" || tag === "h2" || tag === "h3") return tag;
  }
  if ($isQuoteNode(element)) return "quote";
  return "paragraph";
}

function Toolbar({ onPopout }: { onPopout?: () => void }) {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPos, setLinkPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [linkUrl, setLinkUrl] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    link: false,
    block: "paragraph" as BlockType,
  });

  useLayoutEffect(() => {
    if (!blockMenuOpen || !menuRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left });
  }, [blockMenuOpen]);

  useLayoutEffect(() => {
    if (!linkOpen || !linkRef.current) {
      setLinkPos(null);
      return;
    }
    const rect = linkRef.current.getBoundingClientRect();
    setLinkPos({ top: rect.bottom + 4, left: rect.left });
  }, [linkOpen]);

  useEffect(() => {
    if (!linkOpen || !linkPos) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(".notes-link-input")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [linkOpen, linkPos]);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (menuRef.current?.contains(target)) return;
      if (linkRef.current?.contains(target)) return;
      if (target?.closest(".notes-block-menu")) return;
      if (target?.closest(".notes-link-menu")) return;
      setBlockMenuOpen(false);
      setLinkOpen(false);
    }
    function dismiss() {
      setBlockMenuOpen(false);
      setLinkOpen(false);
    }
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);

  useEffect(() => {
    const $read = () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      setFormats({
        bold: selection.hasFormat("bold"),
        italic: selection.hasFormat("italic"),
        underline: selection.hasFormat("underline"),
        link: $selectedLinkUrl() != null,
        block: $currentBlockType(),
      });
    };

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read($read);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $read();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor]);

  function setHeading(type: HeadingOption) {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (type === "paragraph") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () => $createHeadingNode(type as HeadingTagType));
      }
    });
    setBlockMenuOpen(false);
    setLinkOpen(false);
  }

  function openLinkMenu() {
    setBlockMenuOpen(false);
    editor.getEditorState().read(() => {
      setLinkUrl($selectedLinkUrl() ?? "");
    });
    setLinkOpen((open) => !open);
  }

  function applyLink() {
    const next = normalizeLinkUrl(linkUrl);
    if (next != null && !isAllowedLink(next)) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, next);
    setLinkOpen(false);
  }

  function removeLink() {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setLinkOpen(false);
  }

  function toggleBullet() {
    if (formats.block === "bullet") {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  }

  function toggleQuote() {
    if (formats.block === "quote") {
      setHeading("paragraph");
      return;
    }
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () => $createQuoteNode());
    });
  }

  const blockLabel =
    BLOCK_OPTIONS.find((option) => option.type === formats.block)?.label ??
    "Normal";

  return (
    <div className="notes-toolbar" role="toolbar" aria-label="Text formatting">
      <div className="notes-block-picker" ref={menuRef}>
        <button
          type="button"
          className="notes-block-trigger"
          aria-haspopup="listbox"
          aria-expanded={blockMenuOpen}
          onClick={() => {
            setLinkOpen(false);
            setBlockMenuOpen((open) => !open);
          }}
        >
          {blockLabel}
        </button>
      </div>
      {blockMenuOpen && menuPos
        ? createPortal(
            <ul
              className="notes-block-menu"
              role="listbox"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {BLOCK_OPTIONS.map((option) => (
                <li key={option.type}>
                  <button
                    type="button"
                    className={
                      formats.block === option.type ? "is-active" : undefined
                    }
                    onClick={() => setHeading(option.type)}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>,
            portalRoot(),
          )
        : null}
      <span className="notes-toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 14 4 9l5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 9h11a5 5 0 0 1 0 10h-4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m15 14 5-5-5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 9H9a5 5 0 0 0 0 10h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className="notes-toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className={formats.bold ? "is-active" : undefined}
        aria-label="Bold"
        aria-pressed={formats.bold}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        <span className="notes-tool-b" aria-hidden="true">B</span>
      </button>
      <button
        type="button"
        className={formats.italic ? "is-active" : undefined}
        aria-label="Italic"
        aria-pressed={formats.italic}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        <span className="notes-tool-i" aria-hidden="true">I</span>
      </button>
      <button
        type="button"
        className={formats.underline ? "is-active" : undefined}
        aria-label="Underline"
        aria-pressed={formats.underline}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
      >
        <span className="notes-tool-u" aria-hidden="true">U</span>
      </button>
      <div className="notes-link-picker" ref={linkRef}>
        <button
          type="button"
          className={formats.link ? "is-active" : undefined}
          aria-label="Link"
          aria-pressed={formats.link}
          aria-haspopup="dialog"
          aria-expanded={linkOpen}
          onClick={openLinkMenu}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M10 13a5 5 0 0 0 7.54.54l1.83-1.83a5 5 0 0 0-7.07-7.07L10.7 6.24"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 11a5 5 0 0 0-7.54-.54L4.63 12.3a5 5 0 0 0 7.07 7.07l1.54-1.53"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {linkOpen && linkPos
        ? createPortal(
            <div
              className="notes-link-menu"
              role="toolbar"
              aria-label="Edit link"
              style={{ top: linkPos.top, left: linkPos.left }}
              onMouseDown={(event) => event.preventDefault()}
            >
              <input
                type="text"
                className="app-field notes-link-input"
                value={linkUrl}
                autoComplete="off"
                spellCheck={false}
                placeholder="https://"
                aria-label="Link address"
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setLinkOpen(false);
                  }
                }}
              />
              <button type="button" onClick={applyLink}>
                Apply
              </button>
              {formats.link ? (
                <button type="button" className="is-quiet" onClick={removeLink}>
                  Remove
                </button>
              ) : null}
            </div>,
            portalRoot(),
          )
        : null}
      <span className="notes-toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className={formats.block === "bullet" ? "is-active" : undefined}
        aria-label="Bullet list"
        aria-pressed={formats.block === "bullet"}
        onClick={toggleBullet}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6h12M9 12h12M9 18h12" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
          <circle cx="4" cy="6" r="1.25" fill="currentColor" />
          <circle cx="4" cy="12" r="1.25" fill="currentColor" />
          <circle cx="4" cy="18" r="1.25" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className={formats.block === "quote" ? "is-active" : undefined}
        aria-label="Quote"
        aria-pressed={formats.block === "quote"}
        onClick={toggleQuote}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7.2 17.2c-1.7 0-3.1-1.4-3.1-3.2 0-2.6 2-4.8 4.6-5.7l.7 1.5c-1.6.6-2.6 1.7-2.7 2.8.4-.2.9-.2 1.3-.2 1.5 0 2.6 1 2.6 2.5 0 1.3-1.1 2.3-3.4 2.3Zm9.1 0c-1.7 0-3.1-1.4-3.1-3.2 0-2.6 2-4.8 4.6-5.7l.7 1.5c-1.6.6-2.6 1.7-2.7 2.8.4-.2.9-.2 1.3-.2 1.5 0 2.6 1 2.6 2.5 0 1.3-1.1 2.3-3.4 2.3Z" />
        </svg>
      </button>
      {onPopout ? (
        <button
          type="button"
          className="notes-popout"
          aria-label="Open larger editor"
          onClick={onPopout}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M14 4H7.5A2.5 2.5 0 0 0 5 6.5v11A2.5 2.5 0 0 0 7.5 20h11a2.5 2.5 0 0 0 2.5-2.5V14"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 12 20 4M15.2 4H20v4.8"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function NotesComposer({
  value,
  onChange,
  placeholder,
  rows = 4,
  namespace,
  onPopout,
  fill = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  rows?: number;
  namespace: string;
  onPopout?: () => void;
  fill?: boolean;
}) {
  const initialConfig = useMemo(
    () => ({
      namespace,
      theme: {
        paragraph: "notes-editor-p",
        quote: "notes-editor-quote",
        heading: {
          h1: "notes-editor-h1",
          h2: "notes-editor-h2",
          h3: "notes-editor-h3",
        },
        link: "notes-editor-link",
        list: {
          ul: "notes-editor-ul",
          listitem: "notes-editor-li",
        },
        text: {
          bold: "notes-editor-bold",
          italic: "notes-editor-italic",
          underline: "notes-editor-underline",
        },
      },
      nodes: [ListNode, ListItemNode, LinkNode, HeadingNode, QuoteNode],
      onError(error: Error) {
        console.error(error);
      },
      editorState() {
        $loadMarkdown(value || "");
      },
    }),
    // Initial document only; later edits sync through MarkdownSyncPlugin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namespace],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="notes-editor">
        <Toolbar onPopout={onPopout} />
        <div className="notes-editor-inner">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={`notes-editor-input${fill ? " is-fill" : ""}`}
                style={
                  fill
                    ? undefined
                    : { minHeight: `${Math.max(rows, 3) * 1.65}rem` }
                }
                aria-placeholder={placeholder}
                placeholder={
                  <div className="notes-editor-placeholder">{placeholder}</div>
                }
              />
            }
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={isAllowedLink} />
        <MarkdownShortcutPlugin transformers={NOTE_TRANSFORMERS} />
        <MarkdownSyncPlugin value={value} onChange={onChange} />
      </div>
    </LexicalComposer>
  );
}

export function NotesEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
  title = "Notes",
  onCancel,
  onSave,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  rows?: number;
  title?: string;
  onCancel?: () => void;
  onSave?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!expanded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector(".notes-link-menu, .notes-block-menu")) return;
      setExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(".notes-overlay-modal .notes-editor-input")
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  return (
    <>
      <NotesComposer
        namespace="careerchive-notes"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        onPopout={() => setExpanded(true)}
      />
      {expanded
        ? createPortal(
            <ModalShell onClose={() => setExpanded(false)}>
              <div
                className="modal create-entry-modal notes-overlay-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <header className="modal-head">
                  <h2 id={titleId} className="modal-title">
                    {title}
                  </h2>
                  <button
                    type="button"
                    className="icon-btn modal-close"
                    aria-label="Close"
                    onClick={() => setExpanded(false)}
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
                <div className="notes-overlay-body">
                  <NotesComposer
                    namespace="careerchive-notes-overlay"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    fill
                  />
                  {onCancel || onSave ? (
                    <div className="day-form-actions">
                      {onCancel ? (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => {
                            onCancel();
                            setExpanded(false);
                          }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <span />
                      )}
                      {onSave ? (
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => {
                            onSave();
                            setExpanded(false);
                          }}
                        >
                          Save
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </ModalShell>,
            portalRoot(),
          )
        : null}
    </>
  );
}
