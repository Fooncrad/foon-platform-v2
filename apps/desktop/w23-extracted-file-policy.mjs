// W23: independently inspect an EXTRACTED NSIS tree, not staged sources.
// Fail closed on Node backends, scripts, secrets, unexpected nested archives.
// A negative result is a file-inventory check, NOT proof of impossible reverse engineering.
export function classifyExtractedFileNames(fileNames) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return {ok:false,blockers:["W23_EXTRACTED_FILE_INVENTORY_EMPTY"]};
  }
  const blockers = [];
  for (const input of fileNames) {
    if (typeof input !== "string" || !input.length || input.includes("\0")) {
      blockers.push("W23_INVALID_EXTRACTED_PATH");
      continue;
    }
    const path = input.replace(/\\/g, "/").replace(/^\.\/+/, "");
    const lower = path.toLowerCase();
    const parts = lower.split("/");
    if (parts.some(p => p === ".." || p === "node_modules" || p === "edge-runtime")) {
      blockers.push("W23_FORBIDDEN_PATH_SEGMENT");
    }
    if (parts.some(p => p === "node.exe" || p === "npm.cmd" || p === "npx.cmd" ||
      p === "foon-lan-sqlite.mjs")) {
      blockers.push("W23_BUNDLED_NODE_RUNTIME");
    }
    const last = parts[parts.length - 1];
    if (/\.(?:mjs|cjs|js|jsx|ts|tsx|map|env|sql|sqlite|sqlite3|db|asar)$/.test(last) ||
      last === ".env" || last.startsWith(".env.")) {
      blockers.push("W23_BUNDLED_SOURCE_OR_DATA");
    }
    if (/\.(?:7z|zip|tar|tgz|gz|cab|nupkg)$/.test(last)) {
      blockers.push("W23_UNEXTRACTED_NESTED_ARCHIVE");
    }
  }
  return {ok:blockers.length===0,blockers:[...new Set(blockers)]};
}
