import assert from "node:assert/strict";
import test from "node:test";
import { ConfigError, parseConfig } from "../src/config.js";

test("parses supported .quintfmt.conf options", () => {
  assert.deepEqual(parseConfig(`
    indentWidth = 4
    maxLineLength = 88
    alignment {
      mode = local
    }
    declarations.alignment = columns
    alignment.maxPadding = 8
    alignment.recordMaxPadding = unlimited
    alignment.records = off
    alignment.clauses = full
    definitions.spacing = compact
    blankLines.policy = single
    lineEnding = crlf
  `), {
    indentWidth: 4,
    maxLineLength: 88,
    alignment: "local",
    declarationAlignment: "columns",
    maxAlignmentPadding: 8,
    recordMaxAlignmentPadding: "unlimited",
    recordAlignment: "off",
    clauseAlignment: "full",
    definitionSpacing: "compact",
    blankLinePolicy: "single",
    lineEnding: "crlf",
  });
});

test("rejects unknown and invalid .quintfmt.conf options", () => {
  assert.throws(() => parseConfig("declarations.spacing = groups"), ConfigError);
  assert.throws(() => parseConfig("alignment.maxPadding = 0"), ConfigError);
  assert.throws(() => parseConfig("maxLineLength = 0"), ConfigError);
  assert.throws(() => parseConfig("alignment.recordMaxPadding = 0"), ConfigError);
  assert.throws(() => parseConfig("definitions.spacing = groups"), ConfigError);
  assert.throws(() => parseConfig("blankLines.policy = many"), ConfigError);
  assert.throws(() => parseConfig("lineEnding = mac"), ConfigError);
  assert.throws(() => parseConfig("alignment.clauses = local"), ConfigError);
});
