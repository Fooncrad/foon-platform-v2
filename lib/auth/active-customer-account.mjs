/** Fail closed for suspended customer sessions; lock the row before new tenant links. */
export async function activeCustomerAccount(db, userId, lock = false) {
  if (typeof userId !== 'string' || !userId) return false;
  const [rows] = await db.execute(
    "SELECT id FROM users WHERE id=? AND status='active' LIMIT 1" + (lock ? ' FOR UPDATE' : ''),
    [userId]
  );
  return rows.length > 0;
}
