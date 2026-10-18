// FOON W11 commercial distribution surface policy.
// Staged Node .mjs or other backend source code is extractable from NSIS.
// An audit can stop accidental leaks, but cannot make installed code
// impossible to reverse engineer. Never report "reverse-proof".
const dangerousPath=/(^|\/)(?:\.env(?:\..*)?|\.git|\.npmrc|\.pypirc|\.ssh|node_modules|src|tests?|fixtures?|__tests__)(?:\/|$)|\.(?:map|ts|tsx|rs|sql|sqlite|db|pfx|p12|pem|key|crt|log)$/i;
const embeddedSource=/\.(?:mjs|cjs|js|ts|tsx|py|php|rb|go|rs)$/i;
const secretPatterns=[
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bmysql:\/\/[^:@/\s]+:[^@/\s]+@[^/\s]+\//i,
  /\b(?:sk_live_|rk_live_|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/,
  /\bAKIA[0-9A-Z]{16}\b/
];
function normalPath(s){return String(s??"").replaceAll("\\","/").replace(/^\.\/+/,"");}
export function auditFoonDistribution({tauri,resources,frontend,sourceTexts={}}){
  const blocked=new Set(),warnings=new Set();
  if(tauri?.bundle?.active!==true)blocked.add("W11_BUNDLE_CONFIG_INVALID");
  const globs=tauri?.bundle?.resources;
  if(!Array.isArray(globs)||globs.length!==1||globs[0]!=="resources/edge-runtime/**/*")
    blocked.add("W11_UNEXPECTED_BUNDLE_RESOURCES");
  if(tauri?.build?.frontendDist!=="../ui")blocked.add("W11_UNEXPECTED_FRONTEND_SOURCE");
  if(!Array.isArray(resources)||resources.length===0)
    blocked.add("W11_RUNTIME_NOT_STAGED");
  else for(const item of resources){
    const path=normalPath(typeof item==="string"?item:item.path);
    if(!path||path.startsWith("/")||path.includes("..")||item?.symlink===true){
      blocked.add("W11_UNSAFE_BUNDLE_ENTRY");continue;
    }
    if(dangerousPath.test(path))blocked.add("W11_PRIVATE_OR_DEBUG_ASSET_IN_BUNDLE");
    if(embeddedSource.test(path))blocked.add("W11_PLAINTEXT_BACKEND_SOURCE_IN_BUNDLE");
    if(!path.startsWith("resources/edge-runtime/"))
      blocked.add("W11_UNEXPECTED_RESOURCE_LOCATION");
  }
  for(const item of (frontend??[])){
    const path=normalPath(typeof item==="string"?item:item.path);
    if(!path||path.startsWith("/")||path.includes("..")||item?.symlink===true){
      blocked.add("W11_UNSAFE_FRONTEND_ENTRY");continue;
    }
    if(dangerousPath.test(path))blocked.add("W11_PRIVATE_OR_DEBUG_ASSET_IN_BUNDLE");
    if(/\.(?:js|mjs|html|css)$/i.test(path))
      warnings.add("W11_WEBVIEW_ASSETS_EXTRACTABLE_BY_USERS");
  }
  for(const [filename,body] of Object.entries(sourceTexts)){
    if(secretPatterns.some(pattern=>pattern.test(String(body))))
      blocked.add("W11_POSSIBLE_CREDENTIAL_IN_DISTRIBUTION");
    if(filename.endsWith(".map"))blocked.add("W11_SOURCE_MAP_IN_DISTRIBUTION");
  }
  if(tauri?.app?.withGlobalTauri===true)warnings.add("W11_GLOBAL_TAURI_BRIDGE_ENABLED");
  warnings.add("W11_COMPILED_CLIENT_CODE_IS_STILL_REVERSE_ENGINEERABLE");
  return {ok:blocked.size===0,
    blockers:[...blocked].sort(),warnings:[...warnings].sort()};
}
