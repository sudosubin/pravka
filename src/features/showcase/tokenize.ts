export interface Token {
  text: string;
  color: string;
}

export interface SyntaxColors {
  keyword: string;
  string: string;
  number: string;
  comment: string;
  type: string;
  operator: string;
  plain: string;
}

const KEYWORDS = new Set([
  "abstract",
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "keyof",
  "let",
  "namespace",
  "new",
  "null",
  "of",
  "override",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const MULTI_OPS = [
  "...",
  "=>",
  "===",
  "!==",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "::",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**",
  "->",
];

export function tokenize(line: string, colors: SyntaxColors): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  const push = (text: string, color: string) => {
    if (!text) return;
    const last = tokens.at(-1);
    if (last && last.color === color) last.text += text;
    else tokens.push({ text, color });
  };

  while (pos < line.length) {
    const rest = line.slice(pos);

    // line comment
    if (rest.startsWith("//")) {
      push(rest, colors.comment);
      break;
    }

    // block comment start (inline, single-line only)
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      const chunk = end === -1 ? rest : rest.slice(0, end + 2);
      push(chunk, colors.comment);
      pos += chunk.length;
      continue;
    }

    // string literals
    const quote = line[pos];
    if (quote === '"' || quote === "'" || quote === "`") {
      let i = pos + 1;
      while (i < line.length) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      push(line.slice(pos, i), colors.string);
      pos = i;
      continue;
    }

    // numbers
    if (/\d/.test(line[pos]!) && (pos === 0 || /\W/.test(line[pos - 1]!))) {
      const m = rest.match(/^\d+(?:\.\d+)?n?/);
      if (m) {
        push(m[0], colors.number);
        pos += m[0].length;
        continue;
      }
    }

    // identifiers + keywords + types
    if (/[a-zA-Z_$]/.test(line[pos]!)) {
      const m = rest.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
      if (m) {
        const word = m[0];
        const color = KEYWORDS.has(word)
          ? colors.keyword
          : /^[A-Z]/.test(word)
            ? colors.type
            : colors.plain;
        push(word, color);
        pos += word.length;
        continue;
      }
    }

    // multi-char operators
    const multi = MULTI_OPS.find((op) => rest.startsWith(op));
    if (multi) {
      push(multi, colors.operator);
      pos += multi.length;
      continue;
    }

    // single-char operators / punctuation
    if (/[=!<>+\-*/%&|^~?:,;.()[\]{}@#]/.test(line[pos]!)) {
      push(line[pos]!, colors.operator);
      pos++;
      continue;
    }

    // everything else (spaces, CJK, etc.)
    push(line[pos]!, colors.plain);
    pos++;
  }

  return tokens;
}

export function plainTokens(text: string, color: string): Token[] {
  return text ? [{ text, color }] : [];
}
