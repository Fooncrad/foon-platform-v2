import {desktopSyncConfig} from './desktop-sync-config.mjs';
import {eventDigest} from '../../scripts/foon-edge-sync-contract.mjs';
import {ResourceError} from '../../scripts/restaurant-resource-schema.mjs';
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const cents = value => Math.round(Number(value) * 100);
export async function desktopSyncStates(connection, tenantId, orderIds, config=desktopSyncConfig()) {
  if(!config||tenantId!==config.tenantId||!orderIds.length)return new Map();
  const [rows]=await connection.execute("SELECT order_id,SUM(state='conflict') AS conflicts,SUM(state='retrying') AS retries,SUM(state='pending') AS pending FROM desktop_sync_outbox WHERE device_id=? AND tenant_id=? AND branch_id=? AND order_id IN ("+orderIds.map(()=>'?').join(',')+") GROUP BY order_id",[config.deviceId,tenantId,config.branchId,...orderIds]);
  return new Map(rows.map(row=>[row.order_id,Number(row.conflicts)?'conflict':Number(row.retries)?'retrying':Number(row.pending)?'pending':'synced']));
}
export function desktopOrderEvent(order, items, {kind, actorUserId, expectedStatus, requestedPayment}, config) {
  if (order.tenant_id !== config.tenantId || order.branch_id !== config.branchId) throw Error('DESKTOP_SYNC_SCOPE_MISMATCH');
  let error = actorUserId !== config.actorUserId ? 'DESKTOP_ACTOR_REVIEW_REQUIRED' : null;
  if (order.payment_status !== 'unpaid' || requestedPayment === 'paid') error ||= 'DESKTOP_PAYMENT_REVIEW_REQUIRED';
  let payload;
  if (kind === 'created') {
    const snapshot = json(order.checkout_snapshot) || {};
    const unsupported = order.channel !== 'takeaway' || Number(order.discount) !== 0 || order.status !== 'new'
      || ['table_id','reservation_id','coupon_id','customer_user_id','customer_name','customer_phone','kitchen_notes','order_notes'].some(key => order[key])
      || snapshot.pickupPoint || snapshot.hotelRoom || snapshot.assignedDriverId
      || !items.length || items.some(item => !item.menu_exists || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1
        || Number(item.quantity) > 1000 || (json(item.options_snapshot) || []).length);
    if (unsupported) error ||= 'DESKTOP_ORDER_REVIEW_REQUIRED';
    const total = cents(order.total);
    if (!Number.isSafeInteger(total) || total < 0) throw Error('DESKTOP_INVALID_ORDER_TOTAL');
    payload = {id: order.id, branchId: config.branchId, status: 'new', createdAt: new Date(order.created_at).toISOString(),
      expectedTotalCents: total,
      items: items.map(item => ({id: item.menu_item_id, quantity: Number(item.quantity), expectedUnitCents: cents(item.unit_price), expectedCurrency: order.currency}))};
  } else {
    if (!expectedStatus || expectedStatus === order.status) error ||= 'DESKTOP_PAYMENT_REVIEW_REQUIRED';
    payload = {id: order.id, branchId: config.branchId, status: order.status, expectedStatus};
  }
  return {payload, error};
}
// Caller owns the original business transaction. No commit, external request, or detached task here.
export async function queueDesktopOrderEvent(connection, {tenantId, actorUserId, orderId, kind, expectedStatus, requestedPayment}, config = desktopSyncConfig()) {
  if (!config) return;
  if (tenantId !== config.tenantId) throw new ResourceError('FORBIDDEN');
  const [devices] = await connection.execute('SELECT actor_user_id,state,can_create,can_update,lease_until>UTC_TIMESTAMP(3) AS valid_lease FROM desktop_sync_devices WHERE device_id=? AND tenant_id=? AND branch_id=? FOR UPDATE', [config.deviceId, config.tenantId, config.branchId]);
  if (devices.length !== 1 || devices[0].actor_user_id !== config.actorUserId || devices[0].state !== 'active' || !Number(devices[0].valid_lease)) throw new ResourceError('DESKTOP_DEVICE_REAUTHENTICATION_REQUIRED');
  if(!Number(kind==='created'?devices[0].can_create:devices[0].can_update))throw new ResourceError('FORBIDDEN');
  const [orders] = await connection.execute('SELECT * FROM restaurant_orders WHERE id=? AND tenant_id=? FOR UPDATE', [orderId, tenantId]);
  if (orders.length !== 1) throw Error('DESKTOP_ORDER_NOT_FOUND');
  const order = orders[0];
  const [lines] = await connection.execute('SELECT oi.*,mi.id AS menu_exists FROM restaurant_order_items oi LEFT JOIN restaurant_menu_items mi ON mi.id=oi.menu_item_id AND mi.tenant_id=oi.tenant_id WHERE oi.order_id=? AND oi.tenant_id=? ORDER BY oi.id', [orderId, tenantId]);
  const {payload,error} = desktopOrderEvent(order, lines, {kind, actorUserId, expectedStatus, requestedPayment}, config);
  const [existing] = await connection.execute('SELECT id FROM desktop_sync_outbox WHERE device_id=? AND order_id=? AND kind=? AND order_version=?', [config.deviceId, orderId, kind, Number(order.version)]);
  if (existing.length) return;
  const [insert] = await connection.execute("INSERT INTO desktop_sync_outbox(device_id,tenant_id,branch_id,order_id,kind,order_version,payload,digest,state,last_error) VALUES (?,?,?,?,?,?,?,'',?,?)", [config.deviceId,tenantId,config.branchId,orderId,kind,Number(order.version),JSON.stringify(payload),error?'conflict':'pending',error]);
  const seq = Number(insert.insertId);
  if (!Number.isSafeInteger(seq) || seq < 1) throw Error('DESKTOP_EVENT_SEQUENCE_OVERFLOW');
  await connection.execute('UPDATE desktop_sync_outbox SET digest=? WHERE id=?', [eventDigest({seq, order_id:orderId, kind, payload}), seq]);
}
