export const SUPPORT_STAFF_ROLES = new Set(["agent", "admin", "super_admin"]);
export const MASKED_SUPPORT_NAME = "Live Support";

export function isSupportStaffRole(role?: string | null): boolean {
  if (!role) return false;
  return SUPPORT_STAFF_ROLES.has(role);
}

export function shouldMaskSupportIdentityForViewer(params: {
  senderRole?: string | null;
  viewerRole?: string | null;
}): boolean {
  const { senderRole, viewerRole } = params;
  const viewerIsSupportStaff = isSupportStaffRole(viewerRole);
  if (viewerIsSupportStaff) return false;
  return senderRole === "admin" || senderRole === "super_admin";
}

export function resolveSupportDisplayName(params: {
  senderRole?: string | null;
  senderName?: string | null;
  viewerRole?: string | null;
}): string {
  if (shouldMaskSupportIdentityForViewer({ senderRole: params.senderRole, viewerRole: params.viewerRole })) {
    return MASKED_SUPPORT_NAME;
  }
  return params.senderName || MASKED_SUPPORT_NAME;
}

export function hasSupportFirstResponse(params: {
  firstResponseAt?: Date | null;
  senderRole?: string | null;
}): boolean {
  if (params.firstResponseAt) return true;
  return isSupportStaffRole(params.senderRole);
}
