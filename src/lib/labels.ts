// App roles (Wiki Docs owns its own role model).
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "App Admin",
  EDITOR: "Editor",
  READER: "Reader",
};

// SSO primary roles — used for the publish policy and restricted pages.
export const PRIMARY_ROLE_LABELS: Record<string, string> = {
  STAFF_TEACHING: "Staff – Teaching",
  STAFF_NON_TEACHING: "Staff – Non-Teaching",
  STUDENT: "Student",
  SCHOLAR: "Scholar",
  GUEST: "Guest",
};

export const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: "Public",
  AUTHENTICATED: "Signed-in users",
  RESTRICTED: "Restricted",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function primaryRoleLabel(role: string | null | undefined): string {
  if (!role) return "Not set";
  return PRIMARY_ROLE_LABELS[role] ?? role;
}

export function visibilityLabel(v: string): string {
  return VISIBILITY_LABELS[v] ?? v;
}

export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}
