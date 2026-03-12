import { forwardRef, type SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ options, error, className = "", ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`w-full rounded-md border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
          error === true ? "border-status-error" : "border-border"
        } ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
);
