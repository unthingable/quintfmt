import assert from "node:assert/strict";
import test from "node:test";
import { ConfigError, parseConfig } from "../src/config.js";

test("parses supported .quintfmt options", () => {
  assert.deepEqual(parseConfig(`{
    "indentWidth": 4,
    "alignment": "local",
    "declarationAlignment": "columns",
    "maxAlignmentPadding": 8
  }`), {
    indentWidth: 4,
    alignment: "local",
    declarationAlignment: "columns",
    maxAlignmentPadding: 8,
  });
});

test("rejects unknown and invalid .quintfmt options", () => {
  assert.throws(() => parseConfig('{"declarationSpacing":"groups"}'), ConfigError);
  assert.throws(() => parseConfig('{"maxAlignmentPadding":0}'), ConfigError);
});
