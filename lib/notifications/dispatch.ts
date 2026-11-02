import {after} from 'next/server';
import {database} from '@/lib/db/mysql';
import {deliverNotifications} from '@/scripts/notification-delivery.mjs';
// Called only after the enclosing business transaction commits.
export function dispatchNotifications(){after(async()=>{try{await deliverNotifications(database(),{limit:5});}catch{console.error('NOTIFICATION_DISPATCH_UNAVAILABLE');}});}
