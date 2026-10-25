/** How this app is run: alone on this device, or paired with the SeshatCloud of an organization (the answer of /system/status). */
export type DeviceMode = 'standalone' | 'connected'

/**
 * Whether the person manages Knowledge (its sources, its models). On a device of their own, with no organization, they are the only
 * person who can, and the local session has no roles by design: it must not be shut out of its own settings. Paired with SeshatCloud,
 * the roles of the organization decide. While the mode is not known yet (null), only an administrator is let in.
 */
export function canManageKnowledge(roles: string[] | null | undefined, mode: DeviceMode | null): boolean {
  return mode === 'standalone' || hasAdminAccess(roles)
}

export function hasAdminAccess(roles: string[] | null | undefined) {
  return (roles ?? []).some((role) => {
    const normalized = role.trim().toLowerCase()
    return normalized === 'admin' || normalized === 'owner'
  })
}
