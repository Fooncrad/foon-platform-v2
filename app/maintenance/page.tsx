import type {Metadata} from "next";
import SystemStatusScreen from "../system-status-screen";
export const metadata:Metadata={title:"FOON — Maintenance",robots:{index:false,follow:false}};
/** Informational application route; cannot intercept nginx 502/503/504 when Node.js is down. */
export default function Maintenance(){return <SystemStatusScreen status="MAINTENANCE" httpStatus={503} source="maintenance"/>;}
