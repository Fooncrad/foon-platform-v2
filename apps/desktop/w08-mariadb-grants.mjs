// Inspect SHOW GRANTS without exposing authentication hashes.
// MariaDB can append inherited PUBLIC rights on the test and test_%
// namespaces. Accept only those exact two inherited grants in this READ-ONLY
// preflight and warn; do not use this check to authorize schema migrations.
const publicScopes=new Set(["test.*","test\\_%.*"]);

export function checkMariaDbTestGrants(rows){
  if(!Array.isArray(rows)||rows.length===0)throw Error("W08_UNRECOGNIZED_DB_GRANT");
  let scopedAll=false,publicFixtureGrants=0;
  for(const row of rows){
    const value=String(Object.values(row??{})[0]??"").trim();
    const match=/^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+(.+)$/i.exec(value);
    if(!match)throw Error("W08_UNRECOGNIZED_DB_GRANT");
    const privileges=match[1].toUpperCase().trim();
    const scope=match[2].replaceAll(String.fromCharCode(96),"").trim().toLowerCase();
    const recipient=match[3].trim();

    if(/^PUBLIC$/i.test(recipient)){
      if(!publicScopes.has(scope))throw Error("W08_UNEXPECTED_PUBLIC_GRANT");
      publicFixtureGrants++;
      continue;
    }

    // Account may include an IDENTIFIED BY PASSWORD hash in SHOW GRANTS.
    const account=recipient.replaceAll(String.fromCharCode(96),"");
    if(!/^foon_edge_runner@(localhost|127\.0\.0\.1)(?:\s+IDENTIFIED BY PASSWORD\s+'[^']+')?$/i.test(account))
      throw Error("W08_UNEXPECTED_GRANT_RECIPIENT");
    if(scope==="*.*"){
      if(privileges!=="USAGE")throw Error("W08_ACCOUNT_HAS_GLOBAL_PRIVILEGES");
      continue;
    }
    if(scope!=="foon_edge_test.*")throw Error("W08_ACCOUNT_HAS_OTHER_DATABASE_PRIVILEGES");
    if(privileges==="ALL PRIVILEGES")scopedAll=true;
  }
  if(!scopedAll)throw Error("W08_DATABASE_SCOPED_PRIVILEGES_REQUIRED");
  return {publicFixtureGrants};
}
