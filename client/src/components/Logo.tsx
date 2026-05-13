import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import logoDark from "@assets/kiyumart_logo_dark.png";
import logoLight from "@assets/kiyumart_logo_light.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  /** dark = for light backgrounds, light = for dark backgrounds, auto = detect from theme */
  variant?: "dark" | "light" | "auto";
  className?: string;
}

export default function Logo({
  size = "md",
  variant = "auto",
  className,
}: LogoProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { logoLight: platformLogoLight, logoDark: platformLogoDark } = usePlatformSettings();

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") checkDarkMode();
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

  let logoSrc: string;
  if (variant === "auto") {
    if (isDarkMode) {
      logoSrc = platformLogoLight || logoLight;
    } else {
      logoSrc = platformLogoDark || logoDark;
    }
  } else if (variant === "dark") {
    logoSrc = platformLogoDark || logoDark;
  } else {
    logoSrc = platformLogoLight || logoLight;
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
