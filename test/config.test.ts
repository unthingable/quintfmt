import assert from "node:assert/strict";
import test from "node:test";
import { ConfigError, parseConfig } from "../src/config.js";

test("parses supported .quintfmt.conf options", () => {
  assert.deepEqual(parseConfig(`
    indentWidth = 4
    alignment {
      mode = local
    }
    declarations.alignment = columns
    alignment.maxPadding = 8
  `), {
    indentWidth: 4,
    alignment: "local",
    declarationAlignment: "columns",
    maxAlignmentPadding: 8,
  });
});

test("rejects unknown and invalid .quintfmt.conf options", () => {
  assert.throws(() => parseConfig("declarations.spacing = groups"), ConfigError);
  assert.throws(() => parseConfig("alignment.maxPadding = 0"), ConfigError);
});
