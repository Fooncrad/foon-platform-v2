export function canReadReceipt(input:{role:string;assigned:boolean;assignmentRole:string|null;grants:{permission_key:string;allowed:number|boolean;branch_id:string|null}[];branchId:string}){
 if(input.role==='owner'||input.role==='manager')return true;
 if(!['cashier','accountant'].includes(input.role)||!input.assigned||input.assignmentRole!==input.role)return false;
 const scoped=input.grants.filter(g=>g.branch_id===null||g.branch_id===input.branchId),exact=scoped.filter(g=>g.permission_key==='orders.view');
 if(exact.some(g=>!Number(g.allowed)))return false;
 return exact.some(g=>Number(g.allowed)===1)||(!exact.length&&scoped.some(g=>g.permission_key==='orders.manage'&&Number(g.allowed)===1));
}
