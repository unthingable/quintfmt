import { CharStreams, CommonTokenStream, Token } from "antlr4ts";
import { QuintLexer } from "./generated/vendor/quint/QuintLexer.js";
import { QuintParser } from "./generated/vendor/quint/QuintParser.js";

export interface FormatOptions {
  indentWidth?: number;
  maxAlignmentPadding?: number;
  alignment?: "local" | "off";
}

export interface Diagnostic {
  code: "QFMT_PARSE" | "QFMT_INTERNAL";
  line: number;
  column: number;
  message: string;
}

export type FormatResult =
  | { ok: true; formatted: string; diagnostics: [] }
  | { ok: false; formatted: null; diagnostics: Diagnostic[] };

const defaultOptions: Required<FormatOptions> = {
  indentWidth: 2,
  maxAlignmentPadding: 12,
  alignment: "local",
};

type Line = { source: string; tokens: Token[]; comments: Token[]; barrier: boolean };

function parse(source: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const lexer = new QuintLexer(CharStreams.fromString(source));
  const diagnostics: Diagnostic[] = [];
  lexer.removeErrorListeners();
  lexer.addErrorListener({
    syntaxError: (_recognizer, _offendingSymbol, line, column, message) => {
      diagnostics.push({ code: "QFMT_PARSE", line, column: column + 1, message });
    },
  });
  const stream = new CommonTokenStream(lexer);
  const parser = new QuintParser(stream);
  parser.removeErrorListeners();
  parser.addErrorListener({
    syntaxError: (_recognizer, _offendingSymbol, line, column, message) => {
      diagnostics.push({ code: "QFMT_PARSE", line, column: column + 1, message });
    },
  });
  parser.modules();
  const tapeLexer = new QuintLexer(CharStreams.fromString(source));
  tapeLexer.removeErrorListeners();
  tapeLexer.addErrorListener({
    syntaxError: (_recognizer, _offendingSymbol, line, column, message) => {
      diagnostics.push({ code: "QFMT_PARSE", line, column: column + 1, message });
    },
  });
  return { tokens: tapeLexer.getAllTokens().filter((token) => token.type !== Token.EOF), diagnostics };
}

function isComment(token: Token): boolean {
  return token.type === QuintLexer.LINE_COMMENT || token.type === QuintLexer.COMMENT || token.type === QuintLexer.DOCCOMMENT;
}

function makeLines(source: string, tokens: Token[]): Line[] {
  const sourceLines = source.replace(/\r\n/g, "\n").split("\n");
  const lines: Line[] = sourceLines.map((text) => ({ source: text, tokens: [], comments: [], barrier: false }));
  for (const token of tokens) {
    const line = lines[token.line - 1];
    if (!line) continue;
    if (isComment(token)) {
      line.comments.push(token);
      line.barrier = true;
      if ((token.text ?? "").includes("\n")) {
        const end = token.line + (token.text ?? "").split("\n").length - 1;
        for (let index = token.line; index < end && lines[index]; index += 1) lines[index].barrier = true;
      }
    } else if (token.channel === Token.DEFAULT_CHANNEL) {
      line.tokens.push(token);
    }
  }
  return lines;
}

function needsSpace(previous: string, current: string): boolean {
  if ([")", "]", "}", ",", ".", "::", "'"].includes(current)) return false;
  if (["(", "[", ".", "::"].includes(previous)) return false;
  if (previous === "'") return /^[A-Za-z_][A-Za-z0-9_]*$/.test(current) ? false : true;
  if (current === ":") return false;
  if (previous === ":" || previous === ",") return true;
  if (current === "(") return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(previous);
  if (current === "[") return false;
  if (current === "{") return true;
  if (previous === "{") return true;
  return true;
}

function renderTokens(tokens: Token[]): string {
  let rendered = "";
  let previous = "";
  for (const token of tokens) {
    const current = token.text ?? "";
    if (previous && needsSpace(previous, current)) rendered += " ";
    rendered += current;
    previous = current;
  }
  return rendered;
}

function braceDelta(tokens: Token[]): number {
  return tokens.reduce((depth, token) => depth + (token.text === "{" ? 1 : token.text === "}" ? -1 : 0), 0);
}

function startsClose(tokens: Token[]): boolean {
  return tokens[0]?.text === "}";
}

function splitComment(comment: Token): string {
  return (comment.text ?? "").replace(/\r?\n$/, "").trimEnd();
}

function alignDeclarations(lines: string[], maximumPadding: number): string[] {
  const match = lines.map((line) => /^(const|var)\s+([A-Za-z_][\w:]*)\s*:\s*(.+)$/.exec(line));
  if (match.some((item) => !item)) return lines;
  const width = Math.max(...match.map((item) => item![2].length));
  if (match.some((item) => width - item![2].length > maximumPadding)) return lines;
  return match.map((item) => `${item![1]} ${item![2].padEnd(width)} : ${item![3]}`);
}

function alignDelimited(lines: string[], expression: RegExp, maximumPadding: number): string[] {
  const match = lines.map((line) => expression.exec(line));
  if (match.some((item) => !item)) return lines;
  const width = Math.max(...match.map((item) => item![1].length));
  if (match.some((item) => width - item![1].length > maximumPadding)) return lines;
  return match.map((item) => `${item![1].padEnd(width)} ${item![2]} ${item![3]}`);
}

function alignLocal(lines: string[], maximumPadding: number): string[] {
  if (lines.length < 2) return lines;
  const declarations = alignDeclarations(lines, maximumPadding);
  if (declarations !== lines) return declarations;
  const records = alignDelimited(lines, /^([A-Za-z_][\w]*)\s*(:)\s*(.+,?)$/, maximumPadding);
  if (records !== lines) return records;
  return alignDelimited(lines, /^(.+?)\s*(==|!=|<=|>=|<|>|=)\s*(.+)$/, maximumPadding);
}

function alignmentKind(line: string): "declaration" | "record" | "relation" | null {
  const trimmed = line.trimStart();
  if (/^(const|var)\s+[A-Za-z_][\w:]*\s*:/.test(trimmed)) return "declaration";
  if (/^[A-Za-z_][\w]*\s*:/.test(trimmed)) return "record";
  if (/^.+?\s*(==|!=|<=|>=|<|>|=)\s*.+$/.test(trimmed)) return "relation";
  return null;
}

function alignIslands(rendered: string[], barriers: boolean[], maximumPadding: number): string[] {
  const output = [...rendered];
  for (let start = 0; start < output.length;) {
    const kind = !barriers[start] ? alignmentKind(output[start]) : null;
    if (!kind) { start += 1; continue; }
    let end = start + 1;
    while (end < output.length && !barriers[end] && alignmentKind(output[end]) === kind) end += 1;
    const island = output.slice(start, end);
    const prefixes = island.map((line) => line.match(/^\s*/)?.[0] ?? "");
    const aligned = alignLocal(island.map((line) => line.trimStart()), maximumPadding)
      .map((line, index) => `${prefixes[index]}${line}`);
    output.splice(start, island.length, ...aligned);
    start = end;
  }
  return output;
}

/** Formats valid Quint without changing token or comment text. */
export function format(source: string, options: FormatOptions = {}): FormatResult {
  const settings = { ...defaultOptions, ...options };
  try {
    const parsed = parse(source);
    if (parsed.diagnostics.length) return { ok: false, formatted: null, diagnostics: parsed.diagnostics };
    const lines = makeLines(source, parsed.tokens);
    const rendered: string[] = [];
    const barriers: boolean[] = [];
    let depth = 0;
    for (const line of lines) {
      if (!line.tokens.length) {
        const multilineComment = line.comments.some((comment) => comment.type === QuintLexer.COMMENT && (comment.text ?? "").includes("\n"));
        rendered.push(line.comments.length && !multilineComment
          ? `${" ".repeat(depth * settings.indentWidth)}${line.source.trim()}`
          : line.source.trimEnd());
        barriers.push(line.barrier || Boolean(line.source.trim()));
        continue;
      }
      if (line.comments.some((comment) => comment.type === QuintLexer.COMMENT && (comment.text ?? "").includes("\n"))) {
        rendered.push(line.source.trimEnd());
        barriers.push(true);
        continue;
      }
      if (line.tokens[0]?.type === QuintLexer.HASHBANG_LINE) {
        rendered.push(line.source.trimEnd());
        barriers.push(true);
        continue;
      }
      if (line.tokens.length === 1 && line.tokens[0]?.type === QuintLexer.DOCCOMMENT) {
        rendered.push(line.source.trimEnd());
        barriers.push(true);
        continue;
      }
      if (startsClose(line.tokens)) depth = Math.max(0, depth - 1);
      let value = `${" ".repeat(depth * settings.indentWidth)}${renderTokens(line.tokens)}`;
      if (line.comments.length) value += `  ${line.comments.map(splitComment).join(" ")}`;
      rendered.push(value.trimEnd());
      barriers.push(line.barrier);
      depth = Math.max(0, depth + braceDelta(line.tokens) + (startsClose(line.tokens) ? 1 : 0));
    }
    const aligned = settings.alignment === "local" ? alignIslands(rendered, barriers, settings.maxAlignmentPadding) : rendered;
    const compact = aligned.reduce<string[]>((result, line) => {
      if (!line.trim() && !result.at(-1)?.trim()) return result;
      result.push(line);
      return result;
    }, []);
    return { ok: true, formatted: `${compact.join("\n").replace(/\n+$/, "")}\n`, diagnostics: [] };
  } catch (error) {
    return { ok: false, formatted: null, diagnostics: [{ code: "QFMT_INTERNAL", line: 1, column: 1, message: error instanceof Error ? error.message : String(error) }] };
  }
}

export function check(source: string, options: FormatOptions = {}): { ok: boolean; diagnostics: Diagnostic[] } {
  const result = format(source, options);
  return result.ok ? { ok: result.formatted === source, diagnostics: [] } : { ok: false, diagnostics: result.diagnostics };
}
