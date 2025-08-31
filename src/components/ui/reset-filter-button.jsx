"use client";
import { useMemo } from "react";
import { RotateCcw } from "lucide-react";

export default function ResetFiltersButton({
  onReset,
  currentFilters,
  initialFilters,
  clearKeys = [],
  iconOnly = true,       // icon-only by default
  color = "#000",        // black icon
  className = "",
  title = "Reset filters",
}) {
  const disabled = useMemo(
    () => JSON.stringify(currentFilters) === JSON.stringify(initialFilters),
    [currentFilters, initialFilters]
  );

  const handle = () => {
    if (disabled) return;
    onReset && onReset();

    // optionally clear URL params
    if (typeof window !== "undefined" && clearKeys.length) {
      const url = new URL(window.location.href);
      clearKeys.forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={handle}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center p-2 rounded-md",
        "bg-transparent hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      ].join(" ")}
      style={{ color }}
    >
      <RotateCcw className="h-5 w-5" />
      {!iconOnly && <span className="ml-2 text-sm font-medium">Reset</span>}
    </button>
  );
}
