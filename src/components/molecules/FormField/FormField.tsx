"use client";

import { type ComponentPropsWithoutRef, type ReactNode, useId } from "react";
import { Input } from "@/components/atoms/Input";
import { Text } from "@/components/atoms/Text";
import { cn } from "@/lib/utils";

interface FormFieldProps extends ComponentPropsWithoutRef<"input"> {
  /** Field label */
  label: string;
  /** Error message to display */
  error?: string;
  /** Additional CSS classes for wrapper */
  className?: string;
}

/**
 * Form field with label, input, and error message.
 */
export function FormField({
  label,
  error,
  className,
  id: providedId,
  ...inputProps
}: FormFieldProps): ReactNode {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id}>
        <Text variant="small" as="span" className="font-medium">
          {label}
        </Text>
      </label>
      <Input
        id={id}
        error={!!error}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <Text
          id={errorId}
          variant="small"
          className="text-status-error"
          role="alert"
        >
          {error}
        </Text>
      )}
    </div>
  );
}
