// Schedule every minute on a trusted host. This records no-shows and queues
// in-account/email notices; notification delivery is handled by its own worker.
import mysql from 'mysql2/promise';
import {markOverdueReservationsNoShow} from '../lib/restaurant/reservation-no-show.ts';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');
const db=mysql.createPool({uri:process.env.DATABASE_URL,connectionLimit:4,timezone:'Z'});
try{
 await db.query("SET time_zone='+00:00'");
 console.log(JSON.stringify(await markOverdueReservationsNoShow(db)));
}finally{await db.end();}
