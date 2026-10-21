/**
 * Restrict branch-scoped dining resources returned to a waiter to the
 * tables assigned to that employee. Authentication, tenant and branch grants
 * must be verified by the caller before this function is used.
 *
 * Unlinked reservations and calls are deliberately hidden from waiters.
 */
export function scopeWaiterDiningRead(module, resources, assignedTableIds, assignedSectionIds = []) {
  if (!["sections", "tables", "waiterCalls", "reservations"].includes(module)) return resources;
  const allowed = new Set(module === "sections" ? assignedSectionIds : assignedTableIds);
  if (allowed.size === 0) return [];
  return resources.filter((resource) => {
    const id = module === "sections" || module === "tables"
      ? resource.id
      : resource.data?.tableId;
    return typeof id === "string" && allowed.has(id);
  });
}

/** Resolve visible section IDs using only tables already assigned to a waiter. */
export function waiterAssignedSectionIds(tables, assignedTableIds) {
  const allowed = new Set(assignedTableIds);
  return [...new Set(tables
    .filter((table) => allowed.has(table.id))
    .map((table) => table.data?.sectionId)
    .filter((id) => typeof id === "string" && id.length > 0))];
}
