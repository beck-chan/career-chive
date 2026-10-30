"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribeOrigin() {
  return () => {};
}

function getOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return "";
}

export function CopyableUrlField({
  href,
  copyLabel,
  "aria-label": ariaLabel,
}: {
  href: string;
  copyLabel: string;
  "aria-label": string;
}) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    subscribeOrigin,
    getOrigin,
    getServerOrigin,
  );
  const copiedTimer = useRef(0);

  useEffect(() => {
    return () => window.clearTimeout(copiedTimer.current);
  }, []);

  const absolute = origin ? `${origin}${href}` : href;

  async function copyHref() {
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="copyable-url" role="group" aria-label={ariaLabel}>
      <input
        className="app-field copyable-url-field"
        readOnly
        value={absolute}
        aria-label={ariaLabel}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className="text-link"
        onClick={() => void copyHref()}
      >
        {copied ? "Copied" : copyLabel}
      </button>
    </div>
  );
}
