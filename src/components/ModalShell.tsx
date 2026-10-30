import type { ReactNode } from "react";

export function ModalShell({
  onClose,
  stacked = false,
  className,
  children,
}: {
  onClose: () => void;
  stacked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={["modal-backdrop", stacked ? "is-stacked" : null, className]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="modal-backdrop-dismiss"
        aria-label="Close"
        onClick={onClose}
      />
      {children}
    </div>
  );
}
