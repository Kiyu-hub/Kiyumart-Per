export function getRoleDisplayName(role?: string | null): string {
  const normalized = String(role || "").toLowerCase();

  switch (normalized) {
    case "super_admin":
      return "Super Admin";
    case "admin":
      return "Admin";
    case "seller":
      return "Seller";
    case "buyer":
      return "Buyer";
    case "rider":
      return "Rider";
    case "pickup_agent":
      return "Pickup Agent";
    case "agent":
      return "Customer Agent";
    case "support_agent":
      return "Support Agent";
    default:
      return normalized
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function getDashboardRoleLabel(role?: string | null): string {
  const base = getRoleDisplayName(role);
  return base ? `${base} Dashboard` : "Dashboard";
}
