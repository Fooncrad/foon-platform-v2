/**
 * Split the SQL syntax used by our migrations, retaining quoted semicolons.
 * Comments become whitespace; executable comments and DELIMITER fail closed.
 */
export function splitSqlStatements(source, { noBackslashEscapes = false, ansiQuotes = false } = {}) {
  const statements = [];
  let buffer = "";
  let quote = null;
  const flush = () => {
    const sql = buffer.trim();
    if (sql) statements.push(sql);
    buffer = "";
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      buffer += char;
      const stringQuote = quote === "'" || (quote === '"' && !ansiQuotes);
      if (char === "\\" && stringQuote && !noBackslashEscapes) {
        if (next === undefined) throw new Error("Unterminated SQL escape");
        buffer += next;
        i++;
      } else if (char === quote) {
        if (next === quote) {
          buffer += next;
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }
    const dashComment = char === "-" && next === "-" &&
      (source[i + 2] === undefined || /\s/.test(source[i + 2]));
    if (char === "#" || dashComment) {
      while (i < source.length && source[i] !== "\n") i++;
      buffer += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      if (["!", "+"].includes(source[i + 2]) ||
          (source[i + 2] === "M" && source[i + 3] === "!")) {
        throw new Error("Executable SQL comments are not supported");
      }
      const end = source.indexOf("*/", i + 2);
      if (end === -1) throw new Error("Unterminated SQL block comment");
      buffer += " ";
      i = end + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "\x60") {
      quote = char;
      buffer += char;
    } else if (char === ";") {
      flush();
    } else {
      buffer += char;
    }
  }
  if (quote) throw new Error("Unterminated SQL quote");
  flush();
  if (statements.some(sql => /^DELIMITER\b/im.test(sql))) {
    throw new Error("DELIMITER directives are not supported");
  }
  return statements;
}
