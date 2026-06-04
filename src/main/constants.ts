// Canonical admin-email constant for the main process.
// All main-process files that need the admin email import from here.
// client.ts re-exports this so cloud/* files can keep importing from ./client.
// The renderer has its own separate copy: src/renderer/src/supabase/client.ts (ADMIN_EMAIL).
export const CLOUD_ADMIN_EMAIL = 'doriankantor@gmail.com'

// Toggleable per-member permission keys.
// These are the only keys that may appear in the cloud member_permissions table.
// RESERVED capabilities (delete board, permanent-delete contact) are hardcoded
// isRoot checks and have no key here.
export const PERMISSION_KEYS = {
  SEE_ALL_BOARDS:    'see_all_boards',
  DELETE_ATTACHMENT: 'delete_attachment',
  INVITE_MEMBERS:    'invite_members',
} as const
export type PermissionKey = typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS]
