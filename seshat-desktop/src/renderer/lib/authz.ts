export function hasAdminAccess(roles: string[] | null | undefined) {
  return (roles ?? []).some((role) => {
    const normalized = role.trim().toLowerCase()
    return normalized === 'admin' || normalized === 'owner'
  })
}
