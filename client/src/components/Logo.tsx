/**
 * KiyuMart Logo Component
 * 
 * Renders the KiyuMart text logo image.
 * Uses dark version for light mode and light version for dark mode.
 */

import { cn } from "@/lib/utils";
import logoDark from "@assets/kiyumart_logo_dark.png";
import logoLight from "@assets/kiyumart_logo_light.png";

interface LogoProps {
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl";
  /** Color variant - dark for light backgrounds, light for dark backgrounds */
  variant?: "dark" | "light";
  /** Additional CSS classes */
  className?: string;
}

export default function Logo({ 
  size = "md", 
  variant = "dark",
  className,
}: LogoProps) {
  const sizeClasses = {
    sm: "h-6",
    md: "h-8",
    lg: "h-10",
    xl: "h-14",
  };

  const logoSrc = variant === "dark" ? logoDark : logoLight;

  return (
    <img 
      src={logoSrc}
      alt="KiyuMart"
      className={cn(
        "w-auto object-contain",
        sizeClasses[size],
        className
      )}
    />
  );
}
