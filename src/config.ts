import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FormatOptions } from "./api.js";

export class ConfigError extends Error {}

const configurationKeys = new Set(["indentWidth", "alignment", "declarationAlignment", "maxAlignmentPadding"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new ConfigError(`${key} must be a positive integer`);
  return value;
}

export function parseConfig(source: string, label = ".quintfmt"): FormatOptions {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new ConfigError(`${label} must contain JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new ConfigError(`${label} must contain a JSON object`);
  for (const key of Object.keys(value)) if (!configurationKeys.has(key)) throw new ConfigError(`${label}: unknown option ${key}`);
  const options: FormatOptions = {};
  if ("indentWidth" in value) options.indentWidth = positiveInteger(value.indentWidth, "indentWidth");
  if ("maxAlignmentPadding" in value) options.maxAlignmentPadding = positiveInteger(value.maxAlignmentPadding, "maxAlignmentPadding");
  if ("alignment" in value) {
    if (value.alignment !== "local" && value.alignment !== "off") throw new ConfigError("alignment must be local or off");
    options.alignment = value.alignment;
  }
  if ("declarationAlignment" in value) {
    if (value.declarationAlignment !== "types" && value.declarationAlignment !== "columns" && value.declarationAlignment !== "off") {
      throw new ConfigError("declarationAlignment must be types, columns, or off");
    }
    options.declarationAlignment = value.declarationAlignment;
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
    const candidate = resolve(directory, ".quintfmt");
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
