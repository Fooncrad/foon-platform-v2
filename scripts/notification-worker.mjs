// Schedule every minute on a trusted host. No email is sent before provider acceptance.
import mysql from 'mysql2/promise';
import {deliverNotifications} from './notification-delivery.mjs';
const db=await mysql.createConnection(process.env.DATABASE_URL);
try{await db.query("SET time_zone='+00:00'");console.log(await deliverNotifications(db));}finally{await db.end();}
