import type {Instrumentation} from "next";
import {incidentId,logIncident} from "@/lib/platform/incidents";

/** Next's generated error digest is the reference shown by app/error.tsx.
 * Never log raw request headers, cookies, URL search parameters or user data.
 */
export const onRequestError:Instrumentation.onRequestError=(error,_request,context)=>{
 const supplied=typeof error==="object"&&error!==null&&"digest" in error?String(error.digest):"";
 const reference=/^[a-zA-Z0-9_-]{4,80}$/.test(supplied)?supplied:incidentId();
 logIncident({incidentId:reference,code:"UNHANDLED_NEXT_ERROR",location:"next."+String(context.routeType)+":"+String(context.routePath),error});
};
