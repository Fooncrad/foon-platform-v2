import {createHash} from "node:crypto";
export function branchVersion(branch:{name:unknown;slug:unknown;enabled:unknown}){return createHash("sha256").update(JSON.stringify([String(branch.name),String(branch.slug),Boolean(branch.enabled)])).digest("hex");}
