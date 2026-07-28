import assert from "node:assert/strict";
import test from "node:test";
import { format } from "../src/api.js";

test("aligns local declarations without changing comments", () => {
  const source = `module Demo {\nvar owner:str\nconst maxAttempts :int\n// barrier\nvar x: int\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.formatted, `module Demo {\n  var owner:         str\n  const maxAttempts: int\n  // barrier\n  var x: int\n}\n`);
});

test("keeps declaration colons attached while aligning local type values", () => {
  const source = `module Demo {\nconst maxAttempts:int\nvar owner:str\nvar phase:Phase\ndef retryAllowed(s):bool=s.retries<maxAttempts\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /const maxAttempts: int/);
  assert.match(result.formatted, /var owner:\s+str/);
  assert.match(result.formatted, /var phase:\s+Phase/);
  assert.match(result.formatted, /def retryAllowed\(s\): bool = s\.retries < maxAttempts/);
});

test("offers columns and off declaration alignment modes", () => {
  const source = `module Demo {\nconst maximum:int\nvar x:int\n}\n`;
  const columns = format(source, { declarationAlignment: "columns" });
  const off = format(source, { declarationAlignment: "off" });
  assert.equal(columns.ok, true);
  assert.equal(off.ok, true);
  if (!columns.ok || !off.ok) return;
  assert.match(columns.formatted, /var   x:/);
  assert.match(off.formatted, /const maximum: int\n  var x: int/);
});

test("aligns record fields and action relations locally", () => {
  const source = `module Demo {\nval request={\nid:requestId,\nretries:retryCount,\n}\naction step=all {\nowner'=nextOwner,\nretries'=retries+1,\n}\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /id:      requestId,/);
  assert.match(result.formatted, /retries: retryCount/);
  assert.match(result.formatted, /owner'\s+= nextOwner,/);
  assert.match(result.formatted, /retries'\s+= retries \+ 1,/);
});

test("is idempotent and rejects malformed Quint without output", () => {
  const source = `module Demo {\nvar a:int\nvar longer:int\n}\n`;
  const first = format(source);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = format(first.formatted);
  assert.deepEqual(second, first);
  const invalid = format("module {");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.formatted, null);
});

test("preserves inline and block-comment bodies at their token boundaries", () => {
  const source = `module Demo {\nvar alpha:int // keep this\n/* keep\n  this exact body */\nvar beta:int\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /var alpha: int  \/\/ keep this/);
  assert.match(result.formatted, /\/\* keep\n  this exact body \*\//);
  assert.deepEqual(format(result.formatted), result);
});

test("keeps a multiline block comment and code on its closing line verbatim", () => {
  const source = `module Demo {\n/* keep\n  this exact body */ var beta:int\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\/\* keep\n  this exact body \*\/ var beta:int/);
  assert.deepEqual(format(result.formatted), result);
});

test("preserves an inline-started multiline comment before later code", () => {
  const source = `module Demo {\nval x = 1 /* keep\n  exact */ + 2\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /val x = 1 \/\* keep\n  exact \*\/ \+ 2/);
  assert.deepEqual(format(result.formatted), result);
});

test("does not move an inline block comment across significant tokens", () => {
  const source = `module Demo {\nval x = 1 /* explains one */ + 2\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /1 \/\* explains one \*\/ \+ 2/);
});

test("keeps comment trailing whitespace when the line is a comment barrier", () => {
  const source = `module Demo {\n/* keep two spaces  \n  body */\n// keep three   \n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\/\* keep two spaces  \n  body \*\//);
  assert.match(result.formatted, /  \/\/ keep three   \n/);
});

test("formats Quint type definitions and match expressions", () => {
  const source = `module Demo {\ntype Worker = WorkerA | WorkerB\ntype State = { worker: Worker, count: int }\npure def isA(worker: Worker): bool = match worker {\n| WorkerA => true\n| WorkerB => false\n}\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /type Worker = WorkerA \| WorkerB/);
  assert.match(result.formatted, /match worker \{/);
  assert.match(result.formatted, /\| WorkerA => true/);
  assert.doesNotMatch(result.formatted, /= >/);
  assert.deepEqual(format(result.formatted), result);
});

test("keeps nested action assignments in their own alignment island", () => {
  const source = `module Demo {\naction extraordinarilyLongStep=all {\nx'=1,\nlonger'=2,\n}\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /x'\s+= 1,/);
  assert.match(result.formatted, /longer'\s+= 2,/);
});

test("uses readable default layout for continuations, records, and action clauses", () => {
  const source = `module Demo {\nvar state:{\nphase:str,\ncount:int,\n}\npure val InitialPhase="new"\npure val MaxCount=1\npure def isComplete(current:{phase:str,count:int}):bool=\ncurrent.phase=="done" and current.count==MaxCount\naction finish=all {\nstate.phase==InitialPhase,\nstate'={...state,phase:"done",count:MaxCount},\n}\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /phase: str,/);
  assert.doesNotMatch(result.formatted, /phase\s+:/);
  assert.match(result.formatted, /\n    current\.phase ==/);
  assert.match(result.formatted, /\{ \.\.\.state, phase: "done", count: MaxCount \}/);
  assert.match(result.formatted, /state\.phase == InitialPhase,\n    state' =/);
  assert.match(result.formatted, /pure val InitialPhase = "new"\n  pure val MaxCount = 1/);
});

test("normalizes singleton braces without a dangling closing line", () => {
  const inline = format("module Demo {\nval Set = { X\n}\n}\n");
  const multiline = format("module Demo {\nval Set = {\nX\n}\n}\n");
  assert.equal(inline.ok, true);
  assert.equal(multiline.ok, true);
  if (!inline.ok || !multiline.ok) return;
  assert.match(inline.formatted, /val Set = \{ X \}/);
  assert.match(multiline.formatted, /val Set = \{\n    X\n  \}/);
});

test("splits local alignment at the configured padding cap", () => {
  const source = `module Demo {\n  type Record = {\n    extraordinarilyLongField: str,\n    x: str,\n    y: str,\n  }\n}\n`;
  const result = format(source, { maxAlignmentPadding: 12 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /extraordinarilyLongField: str,/);
  assert.match(result.formatted, /\n    x: str,\n    y: str,/);
});

test("separates comment-led and multiline definitions by default", () => {
  const source = `module Demo {\n// first\nval first = 1\n// second\nval second = 2\npure def third: int =\nfirst + second\nval fourth = 4\n}\n`;
  const defaultResult = format(source);
  const compactResult = format(source, { definitionSpacing: "compact" });
  assert.equal(defaultResult.ok, true);
  assert.equal(compactResult.ok, true);
  if (!defaultResult.ok || !compactResult.ok) return;
  assert.match(defaultResult.formatted, /val first = 1\n\n  \/\/ second/);
  assert.match(defaultResult.formatted, /first \+ second\n\n  val fourth = 4/);
  assert.doesNotMatch(compactResult.formatted, /val first = 1\n\n/);
  assert.doesNotMatch(compactResult.formatted, /first \+ second\n\n/);
});

test("lays out multiline Boolean definition chains beneath their header", () => {
  const source = `module Demo {\n  val SciDriftEarlyN0Witness = observation.phase == OutcomeRecorded\n  and state.live == SciDriftedSnapshot\n  and observation.outcome == OutcomeN0\n  and observation.commitReceipt == NoCommitReceipt\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /val SciDriftEarlyN0Witness =\n    observation\.phase\s+== OutcomeRecorded/);
  assert.match(result.formatted, /\n    and state\.live\s+== SciDriftedSnapshot/);
  assert.deepEqual(format(result.formatted), result);
});

test("offers off, operator, and full Boolean-clause layouts", () => {
  const source = `module Demo {\n  val witness = observation.phase == OutcomeRecorded\n  and state.live == SciDriftedSnapshot\n  and observation.outcome == OutcomeN0\n}\n`;
  const off = format(source, { clauseAlignment: "off" });
  const operator = format(source, { clauseAlignment: "operator" });
  const full = format(source, { clauseAlignment: "full" });
  assert.equal(off.ok, true);
  assert.equal(operator.ok, true);
  assert.equal(full.ok, true);
  if (!off.ok || !operator.ok || !full.ok) return;
  assert.match(off.formatted, /val witness =\n    observation\.phase == OutcomeRecorded\n    and state\.live ==/);
  assert.match(operator.formatted, /val witness =\n    observation\.phase\s+== OutcomeRecorded\n    and state\.live\s+==/);
  assert.match(full.formatted, /val witness =\n      observation\.phase\s+== OutcomeRecorded\n  and state\.live\s+==/);
  assert.deepEqual(format(full.formatted, { clauseAlignment: "full" }), full);
});

test("does not interpret operators inside strings as clause syntax", () => {
  const source = `module Demo {\n  action step = all {\n    longer("a=b"),\n    more("c=d"),\n  }\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /longer\("a=b"\),/);
  assert.match(result.formatted, /more\("c=d"\),/);
});

test("full clause alignment normalizes trailing connectors and aligns or operands", () => {
  const trailing = `module Demo {\n  val witness = alpha == 1 and\n    betaLong == 2 and\n    gamma == 3\n}\n`;
  const mixed = `module Demo {\n  val witness =\n    alpha == 1\n  or betaLong == 2\n}\n`;
  const trailingResult = format(trailing, { clauseAlignment: "full" });
  const mixedResult = format(mixed, { clauseAlignment: "full" });
  const globallyOff = format(mixed, { alignment: "off", clauseAlignment: "full" });
  assert.equal(trailingResult.ok, true);
  assert.equal(mixedResult.ok, true);
  assert.equal(globallyOff.ok, true);
  if (!trailingResult.ok || !mixedResult.ok || !globallyOff.ok) return;
  assert.match(trailingResult.formatted, /\n  and betaLong/);
  const mixedLines = mixedResult.formatted.split("\n");
  assert.equal(mixedLines[2]!.indexOf("=="), mixedLines[3]!.indexOf("=="));
  assert.match(mixedResult.formatted, /\n  or  betaLong/);
  assert.match(globallyOff.formatted, /\n    alpha == 1\n    or betaLong == 2/);
});

test("offers independent record and clause alignment controls", () => {
  const source = `module Demo {\n  type Record = {\n    x: str,\n    longer: str,\n  }\n  action step = all {\n    x' = 1,\n    longer' = 2,\n  }\n}\n`;
  const result = format(source, { recordAlignment: "off", clauseAlignment: "off" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /x: str,\n    longer: str,/);
  assert.match(result.formatted, /x' = 1,\n    longer' = 2,/);
});

test("preserves blank lines and source line endings by default", () => {
  const source = "module Demo {\r\n\r\n\r\n  val x = 1\r\n}\r\n";
  const preserved = format(source);
  const normalized = format(source, { blankLinePolicy: "single", lineEnding: "lf" });
  assert.equal(preserved.ok, true);
  assert.equal(normalized.ok, true);
  if (!preserved.ok || !normalized.ok) return;
  assert.match(preserved.formatted, /\r\n\r\n\r\n/);
  assert.doesNotMatch(normalized.formatted, /\r/);
  assert.doesNotMatch(normalized.formatted, /\n\n\n/);
});

test("rejects lexical errors instead of producing best-effort output", () => {
  const result = format("module Demo { var value: int @ }");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.formatted, null);
});
