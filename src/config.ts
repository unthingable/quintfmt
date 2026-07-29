import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FormatOptions } from "./api.js";

export class ConfigError extends Error {}

const configurationKeys = new Set([
  "indentWidth", "alignment.mode", "alignment.maxPadding", "alignment.records", "alignment.recordMaxPadding", "alignment.clauses",
  "declarations.alignment", "definitions.spacing", "blankLines.policy", "lineEnding",
]);

function positiveInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new ConfigError(`${key} must be a positive integer`);
  return value;
}

function parseHocon(source: string, label: string): Map<string, string> {
  const values = new Map<string, string>();
  const scopes: string[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    const line = raw.replace(/\s*(?:#|\/\/).*$/, "").trim();
    if (!line) continue;
    if (line === "}") {
      if (!scopes.length) throw new ConfigError(`${label}:${index + 1}: unexpected }`);
      scopes.pop();
      continue;
    }
    const object = /^([A-Za-z][A-Za-z0-9_.-]*)\s*\{$/.exec(line);
    if (object) {
      scopes.push(...object[1]!.split("."));
      continue;
    }
    const assignment = /^([A-Za-z][A-Za-z0-9_.-]*)\s*(?:=|:)\s*(.+)$/.exec(line);
    if (!assignment) throw new ConfigError(`${label}:${index + 1}: expected key = value or key {`);
    const value = assignment[2]!.trim();
    if (!value || /[{}]/.test(value)) throw new ConfigError(`${label}:${index + 1}: unsupported HOCON value`);
    values.set([...scopes, ...assignment[1]!.split(".")].join("."), value.replace(/^"(.*)"$/, "$1"));
  }
  if (scopes.length) throw new ConfigError(`${label}: unclosed object ${scopes.join(".")}`);
  return values;
}

export function parseConfig(source: string, label = ".quintfmt.conf"): FormatOptions {
  const value = parseHocon(source, label);
  for (const key of value.keys()) if (!configurationKeys.has(key)) throw new ConfigError(`${label}: unknown option ${key}`);
  const options: FormatOptions = {};
  if (value.has("indentWidth")) options.indentWidth = positiveInteger(Number(value.get("indentWidth")), "indentWidth");
  if (value.has("alignment.maxPadding")) options.maxAlignmentPadding = positiveInteger(Number(value.get("alignment.maxPadding")), "alignment.maxPadding");
  if (value.has("alignment.recordMaxPadding")) {
    const padding = value.get("alignment.recordMaxPadding");
    options.recordMaxAlignmentPadding = padding === "unlimited"
      ? "unlimited"
      : positiveInteger(Number(padding), "alignment.recordMaxPadding");
  }
  if (value.has("alignment.mode")) {
    const mode = value.get("alignment.mode");
    if (mode !== "local" && mode !== "off") throw new ConfigError("alignment.mode must be local or off");
    options.alignment = mode;
  }
  if (value.has("alignment.records")) {
    const mode = value.get("alignment.records");
    if (mode !== "local" && mode !== "off") throw new ConfigError("alignment.records must be local or off");
    options.recordAlignment = mode;
  }
  if (value.has("alignment.clauses")) {
    const mode = value.get("alignment.clauses");
    if (mode !== "off" && mode !== "operator" && mode !== "full") {
      throw new ConfigError("alignment.clauses must be off, operator, or full");
    }
    options.clauseAlignment = mode;
  }
  if (value.has("declarations.alignment")) {
    const alignment = value.get("declarations.alignment");
    if (alignment !== "types" && alignment !== "columns" && alignment !== "off") {
      throw new ConfigError("declarations.alignment must be types, columns, or off");
    }
    options.declarationAlignment = alignment;
  }
  if (value.has("definitions.spacing")) {
    const spacing = value.get("definitions.spacing");
    if (spacing !== "nontrivial" && spacing !== "compact") throw new ConfigError("definitions.spacing must be nontrivial or compact");
    options.definitionSpacing = spacing;
  }
  if (value.has("blankLines.policy")) {
    const policy = value.get("blankLines.policy");
    if (policy !== "preserve" && policy !== "single") throw new ConfigError("blankLines.policy must be preserve or single");
    options.blankLinePolicy = policy;
  }
  if (value.has("lineEnding")) {
    const lineEnding = value.get("lineEnding");
    if (lineEnding !== "preserve" && lineEnding !== "lf" && lineEnding !== "crlf") throw new ConfigError("lineEnding must be preserve, lf, or crlf");
    options.lineEnding = lineEnding;
  }
  return options;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findConfig(start = process.cwd()): Promise<string | null> {
  let directory = resolve(start);
  while (true) {
    const candidate = resolve(directory, ".quintfmt.conf");
    if (await exists(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

export async function loadConfig(path: string | null): Promise<FormatOptions> {
  if (path === null) return {};
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigError(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseConfig(source, path);
}
