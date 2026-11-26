import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleTheme, useIsDark } from "@/lib/theme";

export default function ThemeToggle() {
  const isDark = useIsDark();
  return (
    <Button variant="ghost" size="icon" onClick={() => toggleTheme()} data-testid="button-theme-toggle" aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
