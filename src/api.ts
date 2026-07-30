import { CharStreams, CommonTokenStream, ParserRuleContext, Token } from "antlr4ts";
import { QuintLexer } from "./generated/vendor/quint/QuintLexer.js";
import { DotCallContext, MatchContext, MatchSumCaseContext, OperAppContext, QuintParser } from "./generated/vendor/quint/QuintParser.js";

export interface FormatOptions {
  indentWidth?: number;
  maxLineLength?: number;
  maxAlignmentPadding?: number;
  recordMaxAlignmentPadding?: number | "unlimited";
  alignment?: "local" | "off";
  declarationAlignment?: "types" | "columns" | "off";
  recordAlignment?: "local" | "off";
  clauseAlignment?: "off" | "operator" | "full";
  definitionSpacing?: "nontrivial" | "compact";
  blankLinePolicy?: "preserve" | "single";
  lineEnding?: "preserve" | "lf" | "crlf";
}

export interface Diagnostic {
  code: "QFMT_PARSE" | "QFMT_UNSUPPORTED" | "QFMT_INTERNAL";
  line: number;
  column: number;
  message: string;
}

export type FormatResult =
  | { ok: true; formatted: string; diagnostics: [] }
  | { ok: false; formatted: null; diagnostics: Diagnostic[] };

const defaultOptions: Required<FormatOptions> = {
  indentWidth: 2,
  maxLineLength: 100,
  maxAlignmentPadding: 16,
  recordMaxAlignmentPadding: "unlimited",
  alignment: "local",
  declarationAlignment: "types",
  recordAlignment: "local",
  clauseAlignment: "operator",
  definitionSpacing: "nontrivial",
  blankLinePolicy: "preserve",
  lineEnding: "preserve",
};

type Line = { source: string; tokens: Token[]; comments: Token[]; barrier: boolean; verbatim: boolean };

function parse(source: string): { tokens: Token[]; diagnostics: Diagnostic[]; tree: ReturnType<QuintParser["modules"]> } {
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
  const tree = parser.modules();
  const tapeLexer = new QuintLexer(CharStreams.fromString(source));
  tapeLexer.removeErrorListeners();
  tapeLexer.addErrorListener({
    syntaxError: (_recognizer, _offendingSymbol, line, column, message) => {
      diagnostics.push({ code: "QFMT_PARSE", line, column: column + 1, message });
    },
  });
  const tokens = tapeLexer.getAllTokens().filter((token) => token.type !== Token.EOF);
  // `getAllTokens()` does not populate token indexes, while the parser's CST
  // spans are indexed over the same complete token stream.
  tokens.forEach((token, index) => { (token as { tokenIndex: number }).tokenIndex = index; });
  return { tokens, diagnostics, tree };
}

function isComment(token: Token): boolean {
  return token.type === QuintLexer.LINE_COMMENT || token.type === QuintLexer.COMMENT || token.type === QuintLexer.DOCCOMMENT;
}

function makeLines(source: string, tokens: Token[]): Line[] {
  const sourceLines = source.replace(/\r\n/g, "\n").split("\n");
  const lines: Line[] = sourceLines.map((text) => ({ source: text, tokens: [], comments: [], barrier: false, verbatim: false }));
  for (const token of tokens) {
    const line = lines[token.line - 1];
    if (!line) continue;
    if (isComment(token)) {
      line.comments.push(token);
      line.barrier = true;
      if (token.type === QuintLexer.COMMENT) line.verbatim = true;
      if (token.type === QuintLexer.COMMENT && (token.text ?? "").includes("\n")) {
        const end = token.line + (token.text ?? "").split("\n").length - 1;
        for (let index = token.line - 1; index < end && lines[index]; index += 1) {
          lines[index].barrier = true;
          lines[index].verbatim = true;
        }
      }
    } else if (token.channel === Token.DEFAULT_CHANNEL) {
      line.tokens.push(token);
    }
  }
  return lines;
}

function needsSpace(previous: string, current: string): boolean {
  if ([")", "]", ",", ".", "::", "'"].includes(current)) return false;
  if (current === "}") return previous !== "{";
  if (["(", "[", ".", "::"].includes(previous)) return false;
  if (previous === "'") return /^[A-Za-z_][A-Za-z0-9_]*$/.test(current) ? false : true;
  if (previous === "...") return false;
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

function opensDefinitionParameters(tokens: Token[]): boolean {
  return tokens.at(-1)?.text === "("
    && tokens.some((token) => ["def", "action", "temporal", "nondet"].includes(token.text ?? ""));
}

function definitionMatchBodyIndex(tokens: Token[]): number | null {
  if (!tokens.some((token) => ["val", "def", "action", "temporal", "nondet"].includes(token.text ?? ""))) return null;
  const matchIndex = tokens.findIndex((token) => token.type === QuintLexer.MATCH);
  return matchIndex > 0
    && tokens[matchIndex - 1]?.text === "="
    && braceDelta(tokens.slice(matchIndex)) > 0
    ? matchIndex
    : null;
}

function parenthesisDelta(tokens: Token[]): number {
  return tokens.reduce((depth, token) => depth + (token.text === "(" ? 1 : token.text === ")" ? -1 : 0), 0);
}

function splitComment(comment: Token): string {
  return (comment.text ?? "").replace(/\r?\n$/, "");
}

function splitTopLevelCommaSeparated(source: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
      if (depth < 0) return null;
    } else if (character === "," && depth === 0) {
      const part = source.slice(start, index).trim();
      if (!part) return null;
      parts.push(part);
      start = index + 1;
    }
  }
  if (depth !== 0) return null;
  const finalPart = source.slice(start).trim();
  if (!finalPart) return null;
  parts.push(finalPart);
  return parts;
}

function parseDefinitionHeader(line: string): { base: string; name: string; parameters: string; suffix: string; body: string } | null {
  const opening = /^(\s*)((?:pure\s+)?(?:def|action|temporal|nondet)\s+[A-Za-z_][\w:]*)\(/.exec(line);
  if (!opening) return null;
  const parameterStart = opening[0].length - 1;
  let depth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < line.length; index += 1) {
    if (line[index] === "(") depth += 1;
    else if (line[index] === ")" && --depth === 0) {
      parameterEnd = index;
      break;
    }
  }
  if (parameterEnd < 0) return null;
  const remainder = line.slice(parameterEnd + 1);
  depth = 0;
  for (let index = 0; index < remainder.length; index += 1) {
    const character = remainder[index]!;
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth -= 1;
    else if (character === "=" && depth === 0 && remainder[index + 1] !== ">" && !["!", "<", ">", "="].includes(remainder[index - 1] ?? "")) {
      return {
        base: opening[1]!,
        name: opening[2]!,
        parameters: line.slice(parameterStart + 1, parameterEnd),
        suffix: remainder.slice(0, index + 1),
        body: remainder.slice(index + 1),
      };
    }
  }
  return null;
}

function wrapLongDefinitionHeaders(
  lines: string[],
  barriers: boolean[],
  indentWidth: number,
  maximumLength: number,
): { lines: string[]; barriers: boolean[] } {
  const wrapped = [...lines];
  const wrappedBarriers = [...barriers];
  for (let index = 0; index < wrapped.length; index += 1) {
    const line = wrapped[index]!;
    if (line.length <= maximumLength || wrappedBarriers[index] || containsStringLiteral(line)) continue;
    const header = parseDefinitionHeader(line);
    if (!header) continue;
    const parameters = splitTopLevelCommaSeparated(header.parameters);
    if (!parameters || parameters.length < 2) continue;
    const base = header.base;
    const parameterIndentation = `${base}${" ".repeat(indentWidth)}`;
    const replacement = [
      `${base}${header.name}(`,
      ...parameters.map((parameter, parameterIndex) => `${parameterIndentation}${parameter}${parameterIndex < parameters.length - 1 ? "," : ""}`),
      `${base})${header.suffix.trimEnd()}`,
    ];
    const body = header.body.trim();
    if (body) replacement.push(`${parameterIndentation}${body}`);
    wrapped.splice(index, 1, ...replacement);
    wrappedBarriers.splice(index, 1, ...replacement.map(() => false));
    index += replacement.length - 1;
  }
  return { lines: wrapped, barriers: wrappedBarriers };
}

type CallWrap = { line: number; lines: string[]; depth: number };

function visitContexts(context: ParserRuleContext, visit: (context: ParserRuleContext) => void): void {
  visit(context);
  for (let index = 0; index < context.childCount; index += 1) {
    const child = context.getChild(index);
    if (child instanceof ParserRuleContext) visitContexts(child, visit);
  }
}

function ancestors(context: ParserRuleContext): ParserRuleContext[] {
  const result: ParserRuleContext[] = [];
  for (let parent = context.parent; parent; parent = parent.parent) {
    if (parent instanceof ParserRuleContext) result.push(parent);
  }
  return result;
}

function defaultTokens(tokens: Token[], start: number, stop: number): Token[] {
  return tokens.slice(start, stop + 1).filter((token) => token.channel === Token.DEFAULT_CHANNEL);
}

function lastLine(token: Token): number {
  return token.line + ((token.text ?? "").match(/\n/g)?.length ?? 0);
}

function callDepth(context: ParserRuleContext): number {
  return ancestors(context).filter((parent) => parent instanceof OperAppContext || parent instanceof DotCallContext).length;
}

function multilineMatchCase(context: ParserRuleContext): boolean {
  const parents = ancestors(context);
  const matchCase = parents.find((parent) => parent instanceof MatchSumCaseContext);
  const match = parents.find((parent) => parent instanceof MatchContext);
  return Boolean(matchCase && match && matchCase.start.line !== matchCase.stop?.line && match.start.line !== match.stop?.line);
}

function callWrapForContext(
  context: OperAppContext | DotCallContext,
  tokens: Token[],
  sourceLines: string[],
  indentWidth: number,
  maximumLength: number,
): CallWrap | null {
  const argList = context.argList();
  if (!argList || !multilineMatchCase(context)) return null;
  const arguments_ = argList.expr();
  if (arguments_.length < 2 || context.start.line !== context.stop?.line) return null;
  const line = context.start.line - 1;
  if (sourceLines[line]!.length <= maximumLength) return null;
  const lineStart = tokens.findIndex((token) => token.line === context.start.line && token.channel === Token.DEFAULT_CHANNEL);
  const lineEnd = tokens.map((token, index) => ({ token, index })).filter(({ token }) => token.line === context.start.line && token.channel === Token.DEFAULT_CHANNEL).at(-1)?.index;
  if (lineStart < 0 || lineEnd === undefined) return null;
  const stop = context.stop!.tokenIndex;
  const lineTokens = tokens.slice(lineStart, lineEnd + 1);
  if (tokens.some((token) => isComment(token) && token.line <= context.start.line && lastLine(token) >= context.start.line) || lineTokens.some((token) => token.type === QuintLexer.STRING)) return null;
  const trailing = tokens.slice(stop + 1, lineEnd + 1).filter((token) => token.channel === Token.DEFAULT_CHANNEL);
  if (trailing.some((token) => token.text !== ")" && token.text !== ",")) return null;
  const open = context.LPAREN()?.symbol.tokenIndex ?? -1;
  const close = context.RPAREN()?.symbol.tokenIndex ?? -1;
  if (open < 0 || close < 0) return null;
  const commas = arguments_.slice(0, -1).map((argument, index) => defaultTokens(tokens, argument.stop!.tokenIndex + 1, arguments_[index + 1]!.start.tokenIndex - 1));
  if (commas.some((separator) => separator.length !== 1 || separator[0]?.text !== ",")) return null;
  const afterLastArgument = defaultTokens(tokens, arguments_.at(-1)!.stop!.tokenIndex + 1, close - 1);
  if (afterLastArgument.some((token) => token.text !== ",")) return null;
  const indentation = sourceLines[line]!.match(/^\s*/)?.[0] ?? "";
  const argumentIndentation = `${indentation}${" ".repeat(indentWidth)}`;
  const openingColumn = tokens[open]!.charPositionInLine;
  const closingColumn = tokens[close]!.charPositionInLine;
  const rendered = [
    sourceLines[line]!.slice(0, openingColumn + 1),
    ...arguments_.map((argument, index) => `${argumentIndentation}${renderTokens(defaultTokens(tokens, argument.start.tokenIndex, argument.stop!.tokenIndex))}${index < arguments_.length - 1 || afterLastArgument.length ? "," : ""}`),
    `${indentation}${sourceLines[line]!.slice(closingColumn)}`,
  ];
  if (rendered.some((value) => value.length > maximumLength)) return null;
  return { line, lines: rendered, depth: callDepth(context) };
}

function wrapOversizedMatchCalls(
  lines: string[],
  barriers: boolean[],
  indentWidth: number,
  maximumLength: number,
): { lines: string[]; barriers: boolean[]; changed: boolean } {
  const source = `${lines.join("\n")}\n`;
  const parsed = parse(source);
  if (parsed.diagnostics.length) return { lines, barriers, changed: false };
  const candidates: CallWrap[] = [];
  visitContexts(parsed.tree, (context) => {
    if (context instanceof OperAppContext || context instanceof DotCallContext) {
      const candidate = callWrapForContext(context, parsed.tokens, lines, indentWidth, maximumLength);
      if (candidate) candidates.push(candidate);
    }
  });
  const selected = new Map<number, CallWrap>();
  for (const candidate of candidates) {
    const current = selected.get(candidate.line);
    if (!current || candidate.depth > current.depth) selected.set(candidate.line, candidate);
  }
  const wrappedLines: string[] = [];
  const wrappedBarriers: boolean[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const selectedWrap = selected.get(index);
    if (!selectedWrap) {
      wrappedLines.push(lines[index]!);
      wrappedBarriers.push(barriers[index] ?? false);
      continue;
    }
    selectedWrap.lines.forEach((line, replacementIndex) => {
      wrappedLines.push(line);
      wrappedBarriers.push(replacementIndex === 0 ? (barriers[index] ?? false) : true);
    });
  }
  return { lines: wrappedLines, barriers: wrappedBarriers, changed: selected.size > 0 };
}

function containsStringLiteral(line: string): boolean {
  let quoted = false;
  let escaped = false;
  for (const character of line) {
    if (escaped) { escaped = false; continue; }
    if (quoted && character === "\\") { escaped = true; continue; }
    if (character === '"') quoted = !quoted;
  }
  return quoted || /"/.test(line);
}

function alignDeclarations(lines: string[], maximumPadding: number, mode: Required<FormatOptions>["declarationAlignment"]): string[] {
  const match = lines.map((line) => /^(const|var)\s+([A-Za-z_][\w:]*)\s*:\s*(.+)$/.exec(line));
  if (match.some((item) => !item)) return lines;
  if (mode === "off") return lines;
  const qualifierWidth = mode === "columns" ? Math.max(...match.map((item) => item![1].length)) : 0;
  const heads = match.map((item) => `${mode === "columns" ? item![1].padEnd(qualifierWidth) : item![1]} ${item![2]}:`);
  const typeColumn = Math.max(...heads.map((head) => head.length));
  if (heads.some((head) => typeColumn - head.length > maximumPadding)) return lines;
  return match.map((item, index) => `${heads[index].padEnd(typeColumn)} ${item![3]}`);
}

function alignDelimited(lines: string[], expression: RegExp, maximumPadding: number): string[] {
  const match = lines.map((line) => expression.exec(line));
  if (match.some((item) => !item)) return lines;
  const width = Math.max(...match.map((item) => item![1].length));
  if (match.some((item) => width - item![1].length > maximumPadding)) return lines;
  return match.map((item) => `${item![1].padEnd(width)} ${item![2]} ${item![3]}`);
}

function alignRecordFields(
  records: RegExpExecArray[],
  maximumPadding: Required<FormatOptions>["recordMaxAlignmentPadding"],
): string[] {
  const heads = records.map((record) => `${record[1]}:`);
  const widest = Math.max(...heads.map((head) => head.length));
  const narrowest = Math.min(...heads.map((head) => head.length));
  if (maximumPadding === "unlimited" || widest - narrowest <= maximumPadding) {
    return records.map((record, index) => `${heads[index]!.padEnd(widest)} ${record[2]}`);
  }

  // Keep the ordinary fields in one column and let only oversize labels extend
  // to the right. A finite cap should never make the whole record ragged.
  const target = Math.max(...heads.filter((head) => head.length - narrowest <= maximumPadding).map((head) => head.length));
  return records.map((record, index) => {
    const head = heads[index]!;
    return `${head.length <= target ? head.padEnd(target) : head} ${record[2]}`;
  });
}

function alignLocal(
  lines: string[],
  maximumPadding: number,
  recordMaximumPadding: Required<FormatOptions>["recordMaxAlignmentPadding"],
  declarationAlignment: Required<FormatOptions>["declarationAlignment"],
  recordAlignment: Required<FormatOptions>["recordAlignment"],
  clauseAlignment: Required<FormatOptions>["clauseAlignment"],
): string[] {
  if (lines.length < 2) return lines;
  const declarations = alignDeclarations(lines, maximumPadding, declarationAlignment);
  if (declarations !== lines) return declarations;
  const records = lines.map((line) => /^([A-Za-z_][\w]*)\s*:\s*(.+,?)$/.exec(line));
  if (recordAlignment === "local" && records.every(Boolean)) {
    return alignRecordFields(records as RegExpExecArray[], recordMaximumPadding);
  }
  return clauseAlignment !== "off"
    ? alignDelimited(lines, /^(.+?)\s*(==|!=|<=|>=|<|>|=)\s*(.+)$/, maximumPadding)
    : lines;
}

function alignmentKind(
  line: string,
  recordAlignment: Required<FormatOptions>["recordAlignment"],
  clauseAlignment: Required<FormatOptions>["clauseAlignment"],
): "declaration" | "record" | "comparison" | "assignment" | null {
  const trimmed = line.trimStart();
  // A match arm's `=>` is not a relation. Treating its `=` as one rewrites the
  // arrow to `= >` during table alignment and makes otherwise valid Quint fail
  // the output reparse.
  if (trimmed.includes("=>")) return null;
  if (/^(const|var)\s+[A-Za-z_][\w:]*\s*:/.test(trimmed)) return "declaration";
  if (recordAlignment === "local" && /^[A-Za-z_][\w]*\s*:/.test(trimmed)) return "record";
  if (containsStringLiteral(trimmed)) return null;
  if (/^(?:pure\s+)?(?:val|def)|^(?:action|temporal|nondet|type|module)\b/.test(trimmed)) return null;
  if (clauseAlignment !== "off" && /^.+?\s*(==|!=|<=|>=|<|>)\s*.+$/.test(trimmed)) return "comparison";
  if (clauseAlignment !== "off" && /^.+?\s*=\s*.+$/.test(trimmed)) return "assignment";
  return null;
}

function compactSingletonBraces(lines: string[], barriers: boolean[]): { lines: string[]; barriers: boolean[] } {
  const compacted = [...lines];
  const compactedBarriers = [...barriers];
  for (let index = 0; index + 1 < compacted.length; index += 1) {
    if (compactedBarriers[index] || compactedBarriers[index + 1]) continue;
    if (!/^\s*}\s*$/.test(compacted[index + 1])) continue;
    if (!/\{\s*[A-Za-z_][\w]*$/.test(compacted[index])) continue;
    compacted[index] = `${compacted[index].trimEnd()} }`;
    compacted.splice(index + 1, 1);
    compactedBarriers.splice(index + 1, 1);
  }
  return { lines: compacted, barriers: compactedBarriers };
}

function normalizeTrailingBooleanChains(
  lines: string[],
  barriers: boolean[],
  indentWidth: number,
): { lines: string[]; barriers: boolean[] } {
  const normalized = [...lines];
  const normalizedBarriers = [...barriers];
  for (let start = 0; start + 1 < normalized.length; start += 1) {
    if (normalizedBarriers[start] || normalizedBarriers[start + 1] || containsStringLiteral(normalized[start]!)) continue;
    if (!/^\s*(?:pure\s+)?(?:val|def)\b/.test(normalized[start]!)) continue;
    const header = /^(\s*.*?\s=)\s+(.+?)\s+(and|or)$/.exec(normalized[start]!);
    if (!header) continue;
    const clauses = [header[2]!];
    const connectors = [header[3]!];
    let end = start;
    for (let index = start + 1; index < normalized.length && !normalizedBarriers[index]; index += 1) {
      if (containsStringLiteral(normalized[index]!)) break;
      const row = /^\s*(.+?)(?:\s+(and|or))?$/.exec(normalized[index]!);
      if (!row) break;
      clauses.push(row[1]!);
      end = index;
      if (!row[2]) break;
      connectors.push(row[2]!);
    }
    if (end === start || connectors.length !== clauses.length - 1) continue;
    const indent = " ".repeat(indentation(header[1]!) + indentWidth);
    const replacement = [header[1]!, `${indent}${clauses[0]!}`];
    for (let index = 1; index < clauses.length; index += 1) replacement.push(`${indent}${connectors[index - 1]!} ${clauses[index]!}`);
    normalized.splice(start, end - start + 1, ...replacement);
    normalizedBarriers.splice(start, end - start + 1, ...replacement.map(() => false));
    start += replacement.length - 1;
  }
  return { lines: normalized, barriers: normalizedBarriers };
}

function expandBooleanDefinitionChains(
  lines: string[],
  barriers: boolean[],
  indentWidth: number,
  clauseAlignment: Required<FormatOptions>["clauseAlignment"],
): { lines: string[]; barriers: boolean[] } {
  const expanded = [...lines];
  const expandedBarriers = [...barriers];
  for (let index = 0; index + 1 < expanded.length; index += 1) {
    if (expandedBarriers[index] || expandedBarriers[index + 1]) continue;
    const definition = /^\s*(?:pure\s+)?(?:val|def)\b/.test(expanded[index]!);
    const matchArm = /^\s*\|.*=>\s*$/.test(expanded[index]!);
    const fullChainHeader = clauseAlignment === "full"
      && /=\s*$/.test(expanded[index]!)
      && index + 2 < expanded.length
      && !expandedBarriers[index + 2]
      && /^\s*(?!and\b|or\b).+?\s*(==|!=|<=|>=|<|>)\s*.+$/.test(expanded[index + 1]!)
      && /^\s*(?:and|or)\b/.test(expanded[index + 2]!);
    if (!definition && !(clauseAlignment === "full" && matchArm) && !fullChainHeader) continue;
    const inline = /^\s*(?:and|or)\b/.test(expanded[index + 1]!);
    const expandedChain = definition
      && /=\s*$/.test(expanded[index]!)
      && index + 2 < expanded.length
      && !expandedBarriers[index + 2]
      && /^\s*(?:and|or)\b/.test(expanded[index + 2]!);
    const matchArmChain = matchArm
      && index + 2 < expanded.length
      && !expandedBarriers[index + 2]
      && /^\s*(?!and\b|or\b).+?\s*(==|!=|<=|>=|<|>)\s*.+$/.test(expanded[index + 1]!)
      && /^\s*(?:and|or)\b/.test(expanded[index + 2]!);
    if (!inline && !expandedChain && !fullChainHeader && !matchArmChain) continue;
    const match = inline ? /^(\s*.*?\s=)\s+(.+)$/.exec(expanded[index]!) : null;
    if (inline && !match) continue;
    const header = match?.[1] ?? expanded[index]!;
    const baseIndentation = indentation(header);
    const firstIndent = " ".repeat(baseIndentation + (clauseAlignment === "full" ? "and ".length : indentWidth));
    const logicalIndent = " ".repeat(clauseAlignment === "full" ? baseIndentation : baseIndentation + indentWidth);
    let firstIndex = index + 1;
    if (match) {
      expanded[index] = header;
      expanded.splice(firstIndex, 0, `${firstIndent}${match[2]!}`);
      expandedBarriers.splice(firstIndex, 0, false);
    } else {
      expanded[firstIndex] = `${firstIndent}${expanded[firstIndex]!.trimStart()}`;
    }
    index = firstIndex;
    while (index + 1 < expanded.length && !expandedBarriers[index + 1] && /^\s*(?:and|or)\b/.test(expanded[index + 1]!)) {
      expanded[index + 1] = `${logicalIndent}${expanded[index + 1]!.trimStart()}`;
      index += 1;
    }
  }
  return { lines: expanded, barriers: expandedBarriers };
}

function alignFullBooleanChains(lines: string[], barriers: boolean[]): string[] {
  const output = [...lines];
  for (let start = 0; start + 1 < output.length; start += 1) {
    const first = /^(\s*)(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/.exec(output[start]!);
    if (!first || barriers[start] || containsStringLiteral(output[start]!) || output[start]!.includes("=>")) continue;
    const rows: Array<{ index: number; indent: string; connector: string; left: string; operator: string; right: string }> = [
      { index: start, indent: first[1]!, connector: "", left: first[2]!, operator: first[3]!, right: first[4]! },
    ];
    for (let index = start + 1; index < output.length && !barriers[index]; index += 1) {
      if (output[index]!.includes("=>")) break;
      const row = /^(\s*)(and|or)\s+(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/.exec(output[index]!);
      if (!row || containsStringLiteral(output[index]!)) break;
      rows.push({ index, indent: row[1]!, connector: `${row[2]!.padEnd("and".length)} `, left: row[3]!, operator: row[4]!, right: row[5]! });
    }
    if (rows.length < 2) continue;
    const widths = rows.map((row) => row.indent.length + row.connector.length + row.left.length);
    const target = Math.max(...widths);
    for (const row of rows) {
      const padding = target - row.indent.length - row.connector.length - row.left.length;
      output[row.index] = `${row.indent}${row.connector}${row.left}${" ".repeat(padding)} ${row.operator} ${row.right}`;
    }
    start = rows.at(-1)!.index;
  }
  return output;
}

function isDefinition(line: string): boolean {
  return /^(?:(?:pure\s+)?(?:val|def)|action|temporal|nondet)\b/.test(line.trimStart());
}

function definitionKind(line: string): string | null {
  return /^(?:pure\s+)?(val|def|action|temporal|nondet)\b/.exec(line.trimStart())?.[1] ?? null;
}

function isSimpleDefinition(line: string): boolean {
  return isDefinition(line)
    && !/[{]/.test(line)
    && !line.includes("//")
    && !/=\s*$/.test(line);
}

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function isCommentLine(line: string): boolean {
  return /^(?:\/\/|\/\*|\*)/.test(line.trimStart());
}

function separateNontrivialDefinitions(lines: string[]): string[] {
  const separators = new Set<number>();
  for (let start = 0; start < lines.length; start += 1) {
    if (!isDefinition(lines[start]!)) continue;
    const baseIndentation = indentation(lines[start]!);
    let hasLeadingComment = false;
    for (let index = start - 1; index >= 0 && lines[index]!.trim(); index -= 1) {
      if (isCommentLine(lines[index]!)) hasLeadingComment = true;
      else break;
    }
    const commentLedSimpleGroup = hasLeadingComment && isSimpleDefinition(lines[start]!);
    const kind = definitionKind(lines[start]!);
    let end = start;
    while (end + 1 < lines.length) {
      const next = lines[end + 1]!;
      if (!next.trim()) break;
      if (isCommentLine(next)) {
        let following = end + 1;
        while (following + 1 < lines.length && isCommentLine(lines[following + 1]!)) following += 1;
        const nextDefinition = lines[following + 1];
        if (nextDefinition && isDefinition(nextDefinition) && indentation(nextDefinition) <= baseIndentation) break;
      }
      if (isDefinition(next) && indentation(next) <= baseIndentation) {
        if (commentLedSimpleGroup && isSimpleDefinition(next) && definitionKind(next) === kind) {
          end += 1;
          continue;
        }
        break;
      }
      end += 1;
      if (next.trim() === "}" && indentation(next) <= baseIndentation) break;
    }
    const nontrivial = hasLeadingComment || end > start || lines[start]!.includes("//");
    const next = lines[end + 1];
    if (nontrivial && next && next.trim() && next.trim() !== "}") separators.add(end);
    start = end;
  }
  return lines.flatMap((line, index) => separators.has(index) ? [line, ""] : [line]);
}

function alignmentWidths(
  lines: string[],
  kind: "declaration" | "record" | "comparison" | "assignment",
  declarationAlignment: Required<FormatOptions>["declarationAlignment"],
): number[] | null {
  const content = lines.map((line) => line.trimStart());
  if (kind === "declaration") {
    if (declarationAlignment === "off") return null;
    const matches = content.map((line) => /^(const|var)\s+([A-Za-z_][\w:]*)\s*:\s*(.+)$/.exec(line));
    if (matches.some((match) => !match)) return null;
    const qualifierWidth = declarationAlignment === "columns" ? Math.max(...matches.map((match) => match![1].length)) : 0;
    return matches.map((match) => `${declarationAlignment === "columns" ? match![1].padEnd(qualifierWidth) : match![1]} ${match![2]}:`.length);
  }
  if (kind === "record") {
    const matches = content.map((line) => /^([A-Za-z_][\w]*)\s*:\s*(.+,?)$/.exec(line));
    return matches.some((match) => !match) ? null : matches.map((match) => `${match![1]}:`.length);
  }
  const matches = content.map((line) => /^(.+?)\s*(==|!=|<=|>=|<|>|=)\s*(.+)$/.exec(line));
  return matches.some((match) => !match) ? null : matches.map((match) => match![1].length);
}

function alignWithinPadding(
  island: string[],
  kind: "declaration" | "record" | "comparison" | "assignment",
  maximumPadding: number,
  recordMaximumPadding: Required<FormatOptions>["recordMaxAlignmentPadding"],
  declarationAlignment: Required<FormatOptions>["declarationAlignment"],
  recordAlignment: Required<FormatOptions>["recordAlignment"],
  clauseAlignment: Required<FormatOptions>["clauseAlignment"],
): string[] {
  if (kind === "record") {
    const prefixes = island.map((line) => line.match(/^\s*/)?.[0] ?? "");
    return alignLocal(island.map((line) => line.trimStart()), maximumPadding, recordMaximumPadding, declarationAlignment, recordAlignment, clauseAlignment)
      .map((line, index) => `${prefixes[index]}${line}`);
  }
  const output: string[] = [];
  for (let start = 0; start < island.length;) {
    let end = start + 1;
    while (end < island.length) {
      const widths = alignmentWidths(island.slice(start, end + 1), kind, declarationAlignment);
      if (!widths || Math.max(...widths) - Math.min(...widths) > maximumPadding) break;
      end += 1;
    }
    const group = island.slice(start, end);
    const prefixes = group.map((line) => line.match(/^\s*/)?.[0] ?? "");
    output.push(...alignLocal(group.map((line) => line.trimStart()), maximumPadding, recordMaximumPadding, declarationAlignment, recordAlignment, clauseAlignment)
      .map((line, index) => `${prefixes[index]}${line}`));
    start = end;
  }
  return output;
}

function alignIslands(
  rendered: string[],
  barriers: boolean[],
  maximumPadding: number,
  recordMaximumPadding: Required<FormatOptions>["recordMaxAlignmentPadding"],
  declarationAlignment: Required<FormatOptions>["declarationAlignment"],
  recordAlignment: Required<FormatOptions>["recordAlignment"],
  clauseAlignment: Required<FormatOptions>["clauseAlignment"],
): string[] {
  const output = [...rendered];
  for (let start = 0; start < output.length;) {
    const kind = !barriers[start] ? alignmentKind(output[start], recordAlignment, clauseAlignment) : null;
    if (!kind) { start += 1; continue; }
    const indentation = output[start].match(/^\s*/)?.[0] ?? "";
    let end = start + 1;
    while (
      end < output.length
      && !barriers[end]
      && alignmentKind(output[end], recordAlignment, clauseAlignment) === kind
      && (output[end].match(/^\s*/)?.[0] ?? "") === indentation
    ) end += 1;
    const island = output.slice(start, end);
    const aligned = alignWithinPadding(island, kind, maximumPadding, recordMaximumPadding, declarationAlignment, recordAlignment, clauseAlignment);
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
    let continuation = false;
    let definitionParameterDepth = 0;
    let callContinuationDepth = 0;
    const matchBodyBraceDepths: number[] = [];
    let pendingMatchBody = false;
    let pendingMatchArmBody = false;
    const updateDefinitionParameterDepth = (tokens: Token[]) => {
      if (definitionParameterDepth > 0) {
        definitionParameterDepth = Math.max(0, definitionParameterDepth + parenthesisDelta(tokens));
      } else if (opensDefinitionParameters(tokens)) {
        definitionParameterDepth = 1;
      }
    };
    const updateCallContinuationDepth = (tokens: Token[]) => {
      if (callContinuationDepth > 0) {
        callContinuationDepth = Math.max(0, callContinuationDepth + parenthesisDelta(tokens));
      } else if (!opensDefinitionParameters(tokens) && tokens.at(-1)?.text === "(") {
        callContinuationDepth = 1;
      }
    };
    const updateMatchBodyBraceDepth = (tokens: Token[], openedAt: number | null = null) => {
      if (openedAt !== null) {
        matchBodyBraceDepths.push(braceDelta(tokens.slice(openedAt)));
      } else if (matchBodyBraceDepths.length) {
        let delta = braceDelta(tokens);
        while (delta !== 0 && matchBodyBraceDepths.length) {
          const top = matchBodyBraceDepths.length - 1;
          const next = matchBodyBraceDepths[top]! + delta;
          if (next > 0) {
            matchBodyBraceDepths[top] = next;
            delta = 0;
          } else {
            matchBodyBraceDepths.pop();
            delta = next;
          }
        }
      }
    };
    const advanceBraceDepth = (tokens: Token[]) => {
      if (startsClose(tokens)) depth = Math.max(0, depth - 1);
      depth = Math.max(0, depth + braceDelta(tokens) + (startsClose(tokens) ? 1 : 0));
    };
    const advanceLayoutState = (tokens: Token[], openedAt: number | null = null) => {
      if (!tokens.length) return;
      updateDefinitionParameterDepth(tokens);
      updateCallContinuationDepth(tokens);
      updateMatchBodyBraceDepth(tokens, openedAt);
      pendingMatchArmBody = tokens[0]?.text === "|" && tokens.at(-1)?.text === "=>";
      pendingMatchBody = tokens.at(-1)?.text === "=";
    };
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]!;
      const beginsPendingMatchBody = pendingMatchBody && line.tokens[0]?.type === QuintLexer.MATCH && braceDelta(line.tokens) > 0;
      if (line.verbatim) {
        rendered.push(line.source);
        barriers.push(true);
        advanceBraceDepth(line.tokens);
        advanceLayoutState(line.tokens, beginsPendingMatchBody ? 0 : null);
        continue;
      }
      if (!line.tokens.length) {
        const multilineComment = line.comments.some((comment) => comment.type === QuintLexer.COMMENT && (comment.text ?? "").includes("\n"));
        rendered.push(line.comments.length && !multilineComment
          ? `${" ".repeat(depth * settings.indentWidth)}${line.source.trimStart()}`
          : line.source.trimEnd());
        barriers.push(line.barrier || Boolean(line.source.trim()));
        advanceBraceDepth(line.tokens);
        advanceLayoutState(line.tokens, beginsPendingMatchBody ? 0 : null);
        continue;
      }
      if (line.comments.some((comment) => comment.type === QuintLexer.COMMENT && (comment.text ?? "").includes("\n"))) {
        rendered.push(line.source.trimEnd());
        barriers.push(true);
        advanceBraceDepth(line.tokens);
        advanceLayoutState(line.tokens, beginsPendingMatchBody ? 0 : null);
        continue;
      }
      if (line.tokens[0]?.type === QuintLexer.HASHBANG_LINE) {
        rendered.push(line.source);
        barriers.push(true);
        advanceBraceDepth(line.tokens);
        advanceLayoutState(line.tokens, beginsPendingMatchBody ? 0 : null);
        continue;
      }
      if (line.tokens.length === 1 && line.tokens[0]?.type === QuintLexer.DOCCOMMENT) {
        rendered.push(line.source);
        barriers.push(true);
        advanceBraceDepth(line.tokens);
        advanceLayoutState(line.tokens, beginsPendingMatchBody ? 0 : null);
        continue;
      }
      if (startsClose(line.tokens)) depth = Math.max(0, depth - 1);
      const closesParameters = definitionParameterDepth > 0 && line.tokens[0]?.text === ")";
      const closesCall = callContinuationDepth > 0 && line.tokens[0]?.text === ")";
      const beginsNestedMatchBody = beginsPendingMatchBody && matchBodyBraceDepths.length > 0;
      const indentation = depth + matchBodyBraceDepths.length + (beginsNestedMatchBody ? 1 : 0) + (pendingMatchArmBody ? 1 : 0) + ((continuation && !startsClose(line.tokens)) || (definitionParameterDepth > 0 && !closesParameters) || (callContinuationDepth > 0 && !closesCall) ? 1 : 0);
      const matchBodyIndex = line.comments.length ? null : definitionMatchBodyIndex(line.tokens);
      if (matchBodyIndex !== null) {
        rendered.push(`${" ".repeat(indentation * settings.indentWidth)}${renderTokens(line.tokens.slice(0, matchBodyIndex))}`.trimEnd());
        barriers.push(false);
        rendered.push(`${" ".repeat((indentation + 1) * settings.indentWidth)}${renderTokens(line.tokens.slice(matchBodyIndex))}`);
        barriers.push(line.barrier);
      } else {
        let value = `${" ".repeat(indentation * settings.indentWidth)}${renderTokens(line.tokens)}`;
        if (line.comments.length) value += `  ${line.comments.map(splitComment).join(" ")}`;
        rendered.push(line.comments.length ? value : value.trimEnd());
        barriers.push(line.barrier);
      }
      depth = Math.max(0, depth + braceDelta(line.tokens) + (startsClose(line.tokens) ? 1 : 0));
      advanceLayoutState(line.tokens, matchBodyIndex ?? (beginsPendingMatchBody ? 0 : null));
      const nextFirstToken = lines[lineIndex + 1]?.tokens[0]?.text;
      continuation = line.tokens.at(-1)?.text === "="
        || (continuation && (nextFirstToken === "and" || nextFirstToken === "or"));
    }
    const compactedBraces = compactSingletonBraces(rendered, barriers);
    const wrappedHeaders = wrapLongDefinitionHeaders(
      compactedBraces.lines,
      compactedBraces.barriers,
      settings.indentWidth,
      settings.maxLineLength,
    );
    const normalizedTrailingChains = normalizeTrailingBooleanChains(
      wrappedHeaders.lines,
      wrappedHeaders.barriers,
      settings.indentWidth,
    );
    const expandedBooleanChains = expandBooleanDefinitionChains(
      normalizedTrailingChains.lines,
      normalizedTrailingChains.barriers,
      settings.indentWidth,
      settings.alignment === "local" ? settings.clauseAlignment : "off",
    );
    const alignLayout = (layout: { lines: string[]; barriers: boolean[] }): { lines: string[]; barriers: boolean[] } => {
      const aligned = settings.alignment === "local"
        ? alignIslands(
          layout.lines,
          layout.barriers,
          settings.maxAlignmentPadding,
          settings.recordMaxAlignmentPadding,
          settings.declarationAlignment,
          settings.recordAlignment,
          settings.clauseAlignment,
        )
        : layout.lines;
      return {
        lines: settings.alignment === "local" && settings.clauseAlignment === "full"
          ? alignFullBooleanChains(aligned, layout.barriers)
          : aligned,
        barriers: layout.barriers,
      };
    };
    let layout = { lines: expandedBooleanChains.lines, barriers: expandedBooleanChains.barriers };
    for (let pass = 0; pass < 4; pass += 1) {
      const wrappedCalls = wrapOversizedMatchCalls(
        layout.lines,
        layout.barriers,
        settings.indentWidth,
        settings.maxLineLength,
      );
      layout = alignLayout(wrappedCalls);
      if (pass > 0 && !wrappedCalls.changed) break;
    }
    const fullChains = layout.lines;
    const spaced = settings.definitionSpacing === "nontrivial"
      ? separateNontrivialDefinitions(fullChains)
      : fullChains;
    const compact = spaced.reduce<string[]>((result, line) => {
      if (settings.blankLinePolicy === "single" && !line.trim() && !result.at(-1)?.trim()) return result;
      result.push(line);
      return result;
    }, []);
    const lineEnding = settings.lineEnding === "preserve"
      ? (source.includes("\r\n") ? "\r\n" : "\n")
      : settings.lineEnding === "crlf" ? "\r\n" : "\n";
    const formatted = `${compact.join(lineEnding).replace(new RegExp(`(?:${lineEnding})+$`), "")}${lineEnding}`;
    const verification = parse(formatted);
    if (verification.diagnostics.length) return { ok: false, formatted: null, diagnostics: verification.diagnostics };
    return { ok: true, formatted, diagnostics: [] };
  } catch (error) {
    return { ok: false, formatted: null, diagnostics: [{ code: "QFMT_INTERNAL", line: 1, column: 1, message: error instanceof Error ? error.message : String(error) }] };
  }
}

export function check(source: string, options: FormatOptions = {}): { ok: boolean; diagnostics: Diagnostic[] } {
  const result = format(source, options);
  return result.ok ? { ok: result.formatted === source, diagnostics: [] } : { ok: false, diagnostics: result.diagnostics };
}
