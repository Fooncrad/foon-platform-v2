// Keep the order lifecycle fail-closed for unknown or legacy database statuses.
// In particular, never index inherited object properties such as '__proto__'.
const transitions = Object.freeze({
  new: Object.freeze(['preparing', 'cancelled']),
  preparing: Object.freeze(['ready', 'cancelled']),
  ready: Object.freeze(['completed', 'cancelled']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export function orderStatusTransitionAllowed(current, next) {
  return typeof current === 'string' &&
    typeof next === 'string' &&
    Object.hasOwn(transitions, current) &&
    transitions[current].includes(next);
}
