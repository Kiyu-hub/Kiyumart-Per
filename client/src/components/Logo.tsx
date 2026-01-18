/**
 * KiyuMart Logo Component
 * 
 * Renders the KiyuMart text logo image.
 * Automatically detects dark/light mode and switches logos accordingly.
 * - Dark logo (dark teal text) → displayed on light mode backgrounds
 * - Light logo (light cyan text) → displayed on dark mode backgrounds
 */

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import logoDark from "@assets/kiyumart_logo_dark.png";
import logoLight from "@assets/kiyumart_logo_light.png";

interface LogoProps {
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl";
  /** Override auto-detection: dark for light backgrounds, light for dark backgrounds */
  variant?: "dark" | "light" | "auto";
  /** Additional CSS classes */
  className?: string;
}

export default function Logo({ 
  size = "md", 
  variant = "auto",
  className,
}: LogoProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check initial dark mode state
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    
    checkDarkMode();

    // Listen for class changes on documentElement to detect theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          checkDarkMode();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  const sizeClasses = {
    sm: "h-6",
    md: "h-8",
    lg: "h-10",
    xl: "h-14",
  };

  // Determine which logo to show based on variant or auto-detect from theme
  let logoSrc: string;
  if (variant === "auto") {
    // Auto-detect: use light logo for dark theme, dark logo for light theme
    logoSrc = isDarkMode ? logoLight : logoDark;
  } else {
    logoSrc = variant === "dark" ? logoDark : logoLight;
  }

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
