"use client";
import OrderWorkspace from "../order-workspace";

export default function CashierPosClient({tenantId,branch,branches,dining}:{tenantId:string;branch:string;branches:{id:string;name:string}[];dining:boolean}){
 return <OrderWorkspace tenantId={tenantId} module="pos" branch={branch} branches={branches} role="cashier" dining={dining} onChanged={()=>{}}/>;
}
