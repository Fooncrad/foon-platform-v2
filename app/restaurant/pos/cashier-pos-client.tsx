"use client";
import OrderWorkspace from "../order-workspace";

export default function CashierPosClient({tenantId,branch,branches,dining,roomService}:{tenantId:string;branch:string;branches:{id:string;name:string}[];dining:boolean;roomService:boolean}){
 return <OrderWorkspace tenantId={tenantId} module="pos" branch={branch} branches={branches} role="cashier" dining={dining} roomService={roomService} onChanged={()=>{}}/>;
}
