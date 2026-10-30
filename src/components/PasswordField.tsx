"use client";

import { useEffect, useRef, useState } from "react";

const STORED_PASSWORD_MASK = "••••••••";

export function PasswordField({
  value,
  onChange,
  focusOnMount = false,
  hasStoredPassword = false,
  "aria-label": ariaLabel = "Password",
}: {
  value: string;
  onChange: (next: string) => void;
  focusOnMount?: boolean;
  hasStoredPassword?: boolean;
  "aria-label"?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [peekIndex, setPeekIndex] = useState<number | null>(null);
  const [dismissedMask, setDismissedMask] = useState(false);
  const [maskSource, setMaskSource] = useState(hasStoredPassword);
  const inputRef = useRef<HTMLInputElement>(null);
  const peekTimer = useRef<number>(0);
  if (maskSource !== hasStoredPassword) {
    setMaskSource(hasStoredPassword);
    setDismissedMask(false);
  }
  const storedMask = Boolean(hasStoredPassword && !value && !dismissedMask);
  const showPlain = revealed && !storedMask;

  useEffect(() => {
    return () => window.clearTimeout(peekTimer.current);
  }, []);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  function handleChange(next: string) {
    window.clearTimeout(peekTimer.current);
    setDismissedMask(true);
    const insertedOne = !showPlain && next.length === value.length + 1;
    if (insertedOne) {
      let index = 0;
      while (index < value.length && value[index] === next[index]) index += 1;
      setPeekIndex(index);
      peekTimer.current = window.setTimeout(() => setPeekIndex(null), 900);
    } else {
      setPeekIndex(null);
    }
    onChange(next);
  }

  return (
    <div className="password-field">
      <input
        ref={inputRef}
        className={`app-field password-input${showPlain ? " is-revealed" : ""}`}
        type="text"
        autoComplete="new-password"
        spellCheck={false}
        aria-label={ariaLabel}
        value={value}
        onFocus={(event) => {
          if (value) event.currentTarget.select();
        }}
        onKeyDown={(event) => {
          if (
            storedMask &&
            (event.key === "Backspace" || event.key === "Delete")
          ) {
            event.preventDefault();
            setDismissedMask(true);
          }
        }}
        onChange={(event) => handleChange(event.target.value)}
      />
      {showPlain ? null : (
        <span className="password-mask" aria-hidden="true">
          {storedMask
            ? STORED_PASSWORD_MASK
            : value
                .split("")
                .map((char, index) => (index === peekIndex ? char : "•"))
                .join("")}
        </span>
      )}
      <button
        type="button"
        className="password-toggle"
        aria-label={showPlain ? "Hide password" : "Show password"}
        aria-pressed={showPlain}
        disabled={storedMask}
        onClick={() => {
          if (storedMask) return;
          window.clearTimeout(peekTimer.current);
          setPeekIndex(null);
          setRevealed((open) => !open);
        }}
      >
        {revealed ? (
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
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M2.3 11.5a.7.7 0 0 0 0 .5A11.8 11.8 0 0 0 12 18.7c5.2 0 9-4.4 9.7-6.7a.7.7 0 0 0 0-.5A11.8 11.8 0 0 0 12 5.3c-5.2 0-9 4.4-9.7 6.2Z"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.75" />
          </svg>
        )}
      </button>
    </div>
  );
}
