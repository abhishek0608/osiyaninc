import { prisma } from './db.js'

// Build a friendly display name for a user record.
export function userDisplayName(user) {
  if (!user) return null
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return name || user.email || user.id
}

// Resolve a set of user ids to display names for "created by" / "modified by".
// Returns an object map keyed by user id; missing/unknown ids are simply absent.
export async function resolveActorMap(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (!unique.length) return {}
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  const map = {}
  for (const user of users) map[user.id] = userDisplayName(user)
  return map
}

// Look up a single actor's display name from a resolved map, falling back to
// the raw id when the user could no longer be found.
export function actorName(map, id) {
  if (!id) return null
  return map[id] || id
}
