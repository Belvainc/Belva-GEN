import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  /** Image source URL */
  src?: string | null;
  /** Alt text for image */
  alt?: string;
  /** Fallback text (typically initials) when no image */
  fallback: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

const sizeStyles = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

/**
 * Avatar component with image or fallback initials.
 */
export function Avatar({
  src,
  alt = "",
  fallback,
  size = "md",
  className,
}: AvatarProps): ReactNode {
  const initials = fallback.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground overflow-hidden",
        sizeStyles[size],
        className
      )}
      role="img"
      aria-label={alt || fallback}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}
