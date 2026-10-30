"use client";

import type { ReactNode } from "react";

export function EmptyBody({
  copy = "Add your first organization to begin.",
  kicker = "Nothing to see here.",
  action,
}: {
  copy?: string;
  kicker?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-state" role="status">
      {kicker ? <p className="page-state-kicker">{kicker}</p> : null}
      <p className="page-state-copy">{copy}</p>
      {action}
    </div>
  );
}

export function ErrorBody() {
  return (
    <div className="page-state is-error" role="alert">
      <p className="page-state-kicker">Error</p>
      <p className="page-state-copy">No database connection.</p>
    </div>
  );
}

export function LoadingBody({
  kicker = "Loading",
  copy = "Loading archive data ...",
}: {
  kicker?: string;
  copy?: string;
}) {
  return (
    <div className="page-state" role="status">
      <p className="page-state-kicker">{kicker}</p>
      <p className="page-state-copy">{copy}</p>
    </div>
  );
}

export function NotFoundBody({
  kicker = "404",
  copy = "This page could not be found.",
}: {
  kicker?: string;
  copy?: string;
}) {
  return (
    <div className="page-state" role="status">
      <p className="page-state-kicker">{kicker}</p>
      <p className="page-state-copy">{copy}</p>
    </div>
  );
}
