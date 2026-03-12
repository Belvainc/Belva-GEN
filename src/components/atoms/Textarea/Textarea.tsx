import { forwardRef, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ error, className = "", ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`w-full rounded-md border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
          error === true ? "border-status-error" : "border-border"
        } ${className}`}
        rows={4}
        {...props}
      />
    );
  }
);
