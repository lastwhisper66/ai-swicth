/** Move an item within the complete order, including entries hidden by a filtered view. */
export function moveItem<T>(order: T[], id: T, targetId: T): T[] {
  const from = order.indexOf(id)
  const to = order.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}
