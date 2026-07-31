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

test("aligns record values with strings and does not cap records by default", () => {
  const source = `module Demo {\n  val request = {\n    id: "billing",\n    destinationId: "accounting",\n    selectedHeadersDigest: "headers",\n    method: "POST",\n  }\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /id:\s+"billing",/);
  assert.match(result.formatted, /destinationId:\s+"accounting",/);
  assert.match(result.formatted, /selectedHeadersDigest: "headers",/);
  assert.match(result.formatted, /method:\s+"POST",/);
});

test("keeps ordinary record fields aligned around a finite-cap outlier", () => {
  const source = `module Demo {\n  val request = {\n    id: value,\n    name: value,\n    extraordinarilyLongField: value,\n    kind: value,\n  }\n}\n`;
  const result = format(source, { recordMaxAlignmentPadding: 4 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /id:\s+value,/);
  assert.match(result.formatted, /name: value,/);
  assert.match(result.formatted, /extraordinarilyLongField: value,/);
  assert.match(result.formatted, /kind:\s+value,/);
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

test("indents multiline sum-type variants with or without a leading first bar", () => {
  const source = `module Demo {\n  type Store =\n  NoStage\n  | Staged(int)\n  // terminal state\n  | Terminated\n  type Effect =\n  | None\n  | Sent\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /type Store =\n    NoStage\n    \| Staged\(int\)\n    \/\/ terminal state\n    \| Terminated/);
  assert.match(result.formatted, /type Effect =\n    \| None\n    \| Sent/);
  assert.deepEqual(format(result.formatted), result);
});

test("full sum-type alignment gives an optional leading bar a ghost column", () => {
  const source = `module Demo {\n  type Store =\n  NoStage\n  | Staged(int)\n}\n`;
  const full = format(source, { sumTypeAlignment: "full" });
  const globallyOff = format(source, { alignment: "off", sumTypeAlignment: "full" });
  assert.equal(full.ok, true);
  assert.equal(globallyOff.ok, true);
  if (!full.ok || !globallyOff.ok) return;
  assert.match(full.formatted, /type Store =\n      NoStage\n    \| Staged\(int\)/);
  assert.match(globallyOff.formatted, /type Store =\n    NoStage\n    \| Staged\(int\)/);
  assert.deepEqual(format(full.formatted, { sumTypeAlignment: "full" }), full);
});

test("sum-type nesting composes with record bodies at every indent width", () => {
  const source = `module Demo {\n  type TerminalRecord =\n    EarlyN0({ admission: str })\n  | E1Resolved({\n    committed: str,\n    release: str,\n    outcome: str,\n  })\n}\n`;
  for (const indentWidth of [1, 2, 4]) {
    const result = format(source, { indentWidth, sumTypeAlignment: "full" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.match(result.formatted, new RegExp(`type TerminalRecord =\\n${" ".repeat(indentWidth * 2 + 2)}EarlyN0\\(\\{ admission: str \\}\\)\\n${" ".repeat(indentWidth * 2)}\\| E1Resolved\\(\\{\\n${" ".repeat(indentWidth * 3)}committed:`));
    assert.match(result.formatted, new RegExp(`\\n${" ".repeat(indentWidth * 2)}\\}\\)`));
    assert.deepEqual(format(result.formatted, { indentWidth, sumTypeAlignment: "full" }), result);
  }
});

test("first sum variants do not inherit a definition continuation block", () => {
  for (const first of ["A", "| A"]) {
    const source = `module Demo {\n  type Terminal =\n    ${first}({\n      value: str,\n    })\n    | B\n}\n`;
    const result = format(source);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.match(result.formatted, /type Terminal =\n    \|? ?A\(\{\n      value: str,\n    \}\)\n    \| B/);
    assert.deepEqual(format(result.formatted), result);
  }
});

test("breaks a definition before a match body regardless of line width", () => {
  const source = `module Demo {\n  action choose(worker: Worker): bool = match state.workers.get(worker) {\n    | Ready => true\n    | _ => false\n  }\n}\n`;
  const result = format(source, { maxLineLength: 200 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /action choose\(worker: Worker\): bool =\n    match state\.workers\.get\(worker\) \{/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 200 }), result);
});

test("keeps a complete one-line match definition inline", () => {
  const source = `module Demo {\n  val choose = match value { | Ready => true | _ => false }\n}\n`;
  const result = format(source, { maxLineLength: 200 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /val choose = match value \{ \| Ready => true \| _ => false \}/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 200 }), result);
});

test("does not leak match-arm indentation through a verbatim comment body", () => {
  const source = `module Demo {\n  val choose = match value {\n    | Ready =>\n    /* keep */ true\n    | _ => false\n  }\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\n      \| _ => false/);
  assert.deepEqual(format(result.formatted), result);
});

test("does not leak match-body indentation through a verbatim closing line", () => {
  const source = `module Demo {\n  val choose = match value {\n    | Ready => true\n    /* close */ }\n  val after = 1\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\/\* close \*\/ \}\n  val after = 1\n}/);
  assert.deepEqual(format(result.formatted), result);
});

test("keeps outer match layout state after a nested match closes", () => {
  const source = `module Demo {\n  val result = match outer {\n    | A =>\n      val inner = match value {\n        | B => true\n        | _ => false\n      }\n      inner\n    | _ => false\n  }\n}\n`;
  const result = format(source, { maxLineLength: 200 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\n      inner\n      \| _ => false\n    }\n}/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 200 }), result);
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

test("does not apply the generic padding cap to records", () => {
  const source = `module Demo {\n  type Record = {\n    extraordinarilyLongField: str,\n    x: str,\n    y: str,\n  }\n}\n`;
  const result = format(source, { maxAlignmentPadding: 12 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /extraordinarilyLongField: str,/);
  assert.match(result.formatted, /\n    x:\s+str,\n    y:\s+str,/);
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

test("keeps a comment-led run of simple definitions together", () => {
  const source = `module Demo {\n  // bounds\n  pure val SoftBound = 1\n  pure val HardBound = 2\n  pure val MaxClock = 5\n  // identity\n  pure val TheStage = "stage"\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /SoftBound = 1\n  pure val HardBound = 2\n  pure val MaxClock = 5\n\n  \/\/ identity/);
});

test("does not group a comment-led multiline definition with the next definition", () => {
  const source = `module Demo {\n  // explanation\n  pure val first: int =\n    1 + 2\n  pure val second = 2\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /1 \+ 2\n\n  pure val second = 2/);
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

test("hangs multiline fluent suffixes beneath their receiver", () => {
  const source = `module Demo {\n  run c1MismatchCreatesEarlyN0Test =\n    init\n    // admitted request\n    .then(admitAndStage)\n    .then(claim(webhookWorker))\n    .then(\n      nested\n      .observeOwnership(webhookWorker)\n    )\n    .then(done)\n  val after = 0\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /run c1MismatchCreatesEarlyN0Test =\n    init\n      \/\/ admitted request\n      \.then\(admitAndStage\)\n      \.then\(claim\(webhookWorker\)\)\n      \.then\(\n        nested\n          \.observeOwnership\(webhookWorker\)\n      \)\n      \.then\(done\)\n  val after = 0/);
  assert.deepEqual(format(result.formatted), result);
});

test("hangs multiline fluent suffixes for every operator qualifier", () => {
  const declarations = [
    "val value =",
    "pure val pureValue =",
    "def function =",
    "pure def pureFunction =",
    "action transition =",
    "run scenario =",
    "temporal property =",
    "nondet choice =",
  ];
  const source = `module Demo {\n${declarations.map((declaration) => `  ${declaration}\n    init\n    .then(first)\n    .then(second)`).join("\n")}\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.formatted.match(/^      \.then\(/gm) ?? []).length, declarations.length * 2);
  assert.deepEqual(format(result.formatted), result);
});

test("keeps fluent suffix targets through parent-expression tails", () => {
  const inline = `module Demo {\n  run scenario = init\n  .then(first) + 1\n}\n`;
  const closing = `module Demo {\n  run scenario =\n    init\n    .then(\n      first\n    ) + 1\n}\n`;
  for (const source of [inline, closing]) {
    const result = format(source);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.match(result.formatted, /\n(?:    |      )\.then/);
    assert.deepEqual(format(result.formatted), result);
  }
  const closingResult = format(closing);
  if (!closingResult.ok) return;
  assert.match(closingResult.formatted, /\.then\(\n        first\n      \) \+ 1/);
});

test("keeps fluent chain targets inside conditional and match bodies", () => {
  const conditional = `module Demo {\n  val result = if (ready) {\n    init\n    .then(\n      first\n    )\n    .then(done)\n  } else {\n    fallback\n  }\n}\n`;
  const match = `module Demo {\n  val result = match value {\n    | Ready => init\n    .then(\n      first\n    )\n    .then(done)\n    | _ => fallback\n  }\n}\n`;
  for (const source of [conditional, match]) {
    const result = format(source);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.match(result.formatted, /init\n\s+\.then\(\n\s+first\n\s+\)\n\s+\.then\(done\)/);
    assert.deepEqual(format(result.formatted), result);
  }
});

test("keeps fluent-chain comments at their owning suffix level", () => {
  const source = `module Demo {\n  run scenario =\n    init\n    // before suffix\n    .then(\n      // inside arguments\n      first\n      // before close\n    )\n    // between suffixes\n    .then(done)\n  val after = 0\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /    init\n      \/\/ before suffix\n      \.then\(\n        \/\/ inside arguments\n        first\n        \/\/ before close\n      \)\n      \/\/ between suffixes\n      \.then\(done\)\n  val after/);
  assert.deepEqual(format(result.formatted), result);
});

test("uses verbatim fluent receivers as layout anchors without rewriting them", () => {
  const source = `module Demo {\n  run scenario = /* keep */ init\n  .then(first)\n  run nested =\n    init\n    .then(\n      /* keep */ inner\n      .then(second)\n    )\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /run scenario = \/\* keep \*\/ init\n    \.then\(first\)/);
  assert.match(result.formatted, /\/\* keep \*\/ inner\n          \.then\(second\)/);
  assert.deepEqual(format(result.formatted), result);
});

test("keeps a multiline conditional expression inside its definition body", () => {
  const source = `module Demo {\n  pure def contractDigestFor(dispatch: int): str =\n    if (dispatch == 0) {\n      Contract("approved")\n    } else {\n      Contract("changed")\n    }\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /: str =\n    if\(dispatch == 0\) \{\n      Contract\("approved"\)\n    \} else \{\n      Contract\("changed"\)\n    \}/);
  assert.deepEqual(format(result.formatted), result);
});

test("keeps next-line and unbraced conditional branches inside their definition body", () => {
  const nextLineBrace = `module Demo {\n  pure def f(x: int): int =\n    if (x > 0)\n    {\n      x\n    } else {\n      0\n    }\n}\n`;
  const unbraced = `module Demo {\n  pure def f(x: int): int =\n    if (x > 0)\n      x\n    else\n      0\n}\n`;
  for (const source of [nextLineBrace, unbraced]) {
    const result = format(source);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.match(result.formatted, /: int =\n    if\(x > 0\)/);
    assert.match(result.formatted, /\n      (?:\{|x)/);
    assert.match(result.formatted, /\n    (?:\} )?else/);
    assert.deepEqual(format(result.formatted), result);
  }
});

test("keeps nested and match conditional branches at their CST-defined depth", () => {
  const nested = `module M {\n  pure def f(a: bool, b: bool): int =\n    if (a)\n      if (b)\n        1\n      else\n        2\n    else\n      3\n}\n`;
  const matchBranch = `module M {\n  pure def f(a: bool): int =\n    if (a)\n      match value {\n        | Some(v) => longCall(firstLongArgument, secondLongArgument, thirdLongArgument)\n        | _ => 0\n      }\n    else\n      0\n}\n`;
  for (const source of [nested, matchBranch]) {
    const result = format(source, { clauseAlignment: "full", maxLineLength: 55 });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.match(result.formatted, /\n      (?:if\(b\)|match value \{)/);
    assert.deepEqual(format(result.formatted, { clauseAlignment: "full", maxLineLength: 55 }), result);
  }
});

test("does not double-indent an inline structured conditional branch", () => {
  const source = `module M {\n  pure def f(a: bool): int =\n    if (a) match value {\n      | Some(v) => longCall(firstLongArgument, secondLongArgument, thirdLongArgument)\n      | _ => 0\n    } else 0\n}\n`;
  const result = format(source, { clauseAlignment: "full", maxLineLength: 55 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /if\(a\) match value \{\n      \| Some\(v\)/);
  assert.deepEqual(format(result.formatted, { clauseAlignment: "full", maxLineLength: 55 }), result);
});

test("uses semantic indentation only when an inline conditional branch has no open delimiter", () => {
  const balancedBrace = `module M {\n  pure def f(a: bool, b: bool): bool =\n    if (a) { 1 }.contains(1)\n    and b\n    else false\n}\n`;
  const continuedCall = `module M {\n  pure def f(a: bool): int =\n    if (a) longCall(\n      firstLongArgument,\n      secondLongArgument\n    ) else 0\n}\n`;
  for (const source of [balancedBrace, continuedCall]) {
    const result = format(source, { clauseAlignment: "full" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.deepEqual(format(result.formatted, { clauseAlignment: "full" }), result);
  }
  const balancedResult = format(balancedBrace, { clauseAlignment: "full" });
  const callResult = format(continuedCall, { clauseAlignment: "full" });
  if (!balancedResult.ok || !callResult.ok) return;
  assert.match(balancedResult.formatted, /\n      and b/);
  assert.match(callResult.formatted, /longCall\(\n      firstLongArgument/);
});

test("does not treat conditional comparisons or partial parentheses as physical continuations", () => {
  const conditionalComparison = `module M {\n  pure def f(x: int, b: bool): bool =\n    if (x > 0) true\n    and b\n    else false\n}\n`;
  const partialParentheses = `module M {\n  pure def f(a: bool, x: int, y: int): int =\n    if (a) (x +\n      y)\n    else 0\n}\n`;
  for (const source of [conditionalComparison, partialParentheses]) {
    const result = format(source, { clauseAlignment: "full" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.deepEqual(format(result.formatted, { clauseAlignment: "full" }), result);
  }
  const comparisonResult = format(conditionalComparison, { clauseAlignment: "full" });
  const parenthesesResult = format(partialParentheses, { clauseAlignment: "full" });
  if (!comparisonResult.ok || !parenthesesResult.ok) return;
  assert.match(comparisonResult.formatted, /=\n    if\(x > 0\) true\n      and b\n    else false/);
  assert.match(parenthesesResult.formatted, /if\(a\) \(x \+\n      y\)/);
});

test("does not double-indent inline structured else branches", () => {
  const callBranch = `module M {\n  pure def f(a: bool): int =\n    if (a)\n      0\n    else longCall(\n      firstLongArgument,\n      secondLongArgument\n    )\n}\n`;
  const matchBranch = `module M {\n  pure def f(a: bool): int =\n    if (a)\n      0\n    else match value {\n      | Some(v) => v\n      | _ => 0\n    }\n}\n`;
  for (const source of [callBranch, matchBranch]) {
    const result = format(source, { clauseAlignment: "full" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.deepEqual(format(result.formatted, { clauseAlignment: "full" }), result);
  }
  const callResult = format(callBranch, { clauseAlignment: "full" });
  const matchResult = format(matchBranch, { clauseAlignment: "full" });
  if (!callResult.ok || !matchResult.ok) return;
  assert.match(callResult.formatted, /else longCall\(\n      firstLongArgument,\n      secondLongArgument\n    \)/);
  assert.match(matchResult.formatted, /else match value \{\n      \| Some\(v\) => v\n      \| _ => 0\n    \}/);
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
  assert.match(full.formatted, /val witness =\n        observation\.phase\s+== OutcomeRecorded\n    and state\.live\s+==/);
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
  assert.match(trailingResult.formatted, /\n    and betaLong/);
  const mixedLines = mixedResult.formatted.split("\n");
  assert.equal(mixedLines[2]!.indexOf("=="), mixedLines[3]!.indexOf("=="));
  assert.match(mixedResult.formatted, /\n    or  betaLong/);
  assert.match(globallyOff.formatted, /\n    alpha == 1\n    or betaLong == 2/);
});

test("full clause alignment hangs match-arm connectors while aligning operands", () => {
  const source = `module Demo {\n  val Check = match storeRow {\n    | CommittedForDispatch(committed) =>\n      committed.contract == expected\n      and committed.capability == expectedCapability\n      and committed.receipt == expectedReceipt\n    | _ => true\n  }\n}\n`;
  const result = format(source, { clauseAlignment: "full" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /CommittedForDispatch\(committed\) =>\n            committed\.contract/);
  assert.match(result.formatted, /\n        and committed\.capability/);
  const lines = result.formatted.split("\n");
  const clauses = lines.filter((line) => /committed\.(?:contract|capability|receipt)/.test(line));
  assert.equal(clauses[0]!.indexOf("=="), clauses[1]!.indexOf("=="));
  assert.equal(clauses[1]!.indexOf("=="), clauses[2]!.indexOf("=="));
  assert.deepEqual(format(result.formatted, { clauseAlignment: "full" }), result);
});

test("full clause alignment leaves a single match-arm comparison at its normal indentation", () => {
  const source = `module Demo {\n  val Check = match value {\n    | Some(v) =>\n      v == expected\n    | _ => false\n  }\n}\n`;
  const result = format(source, { clauseAlignment: "full" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /Some\(v\) =>\n        v == expected/);
  assert.deepEqual(format(result.formatted, { clauseAlignment: "full" }), result);
});

test("full clause alignment includes the head after a multiline definition header", () => {
  const source = `module Demo {\n  pure def canAcceptAtE1(\n    committed: CommittedStage,\n    request: Request,\n  ): bool =\n    request.capability == committed.capability\n    and request.capability.stageId == committed.stageId\n    and request.capability.contractDigest == committed.contractDigest\n}\n`;
  const result = format(source, { clauseAlignment: "full" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\): bool =\n        request\.capability/);
  assert.match(result.formatted, /\n    and request\.capability\.stageId/);
  const lines = result.formatted.split("\n");
  assert.equal(lines[5]!.indexOf("=="), lines[6]!.indexOf("=="));
  assert.equal(lines[6]!.indexOf("=="), lines[7]!.indexOf("=="));
  assert.deepEqual(format(result.formatted, { clauseAlignment: "full" }), result);
});

test("wraps a long definition parameter list at maxLineLength", () => {
  const source = `module Demo {\n  pure def canAcceptAtE1(committed: CommittedStage, request: DispatchRequest, actuator: ActuatorState, now: int): bool = request.capability == committed.capability\n}\n`;
  const result = format(source, { maxLineLength: 80 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /pure def canAcceptAtE1\(\n    committed: CommittedStage,/);
  assert.match(result.formatted, /    now:\s+int\n  \): bool =\n    request\.capability/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 80 }), result);
});

test("wraps headers with operator and parenthesized return types without mistaking them for bodies", () => {
  const source = `module Demo {\n  pure def choose(firstParameter: int, secondParameter: int): int => bool = firstParameter == secondParameter\n  pure def wrap(firstParameter: int, secondParameter: int): (int => bool) = choose\n}\n`;
  const result = format(source, { maxLineLength: 60 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\): int => bool =\n    firstParameter == secondParameter/);
  assert.match(result.formatted, /\): \(int => bool\) =\n    choose/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 60 }), result);
});

test("wraps the deepest oversized call in a multiline match arm", () => {
  const source = `module Demo {\n  action issueC1Grant(worker: Worker): bool = match state.workers.get(worker) {\n    | WorkerObserved(observed) => all {\n      not(state.c1Grants.contains(c1GrantFor(worker, observed.stageId, observed.fence, state.authority.liveSnapshot)))\n    }\n  }\n}\n`;
  const result = format(source, { maxLineLength: 80 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /not\(state\.c1Grants\.contains\(c1GrantFor\(\n          worker,\n          observed\.stageId,\n          observed\.fence,\n          state\.authority\.liveSnapshot\n        \)\)\)/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 80 }), result);
});

test("does not wrap a multi-argument match-arm call that already fits", () => {
  const source = `module Demo {\n  val result = match value {\n    | Some(v) => all {\n      f(a, b)\n    }\n    | _ => fallback\n  }\n}\n`;
  const result = format(source, { maxLineLength: 100 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /f\(a, b\)/);
  assert.doesNotMatch(result.formatted, /f\(\n/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 100 }), result);
});

test("preserves a chained dot-call receiver when wrapping its arguments", () => {
  const source = `module Demo {\n  val result = match value {\n    | Some(v) => all {\n      not(factory(worker).make(observed.stageId, observed.fence, state.authority.liveSnapshot))\n    }\n    | _ => fallback\n  }\n}\n`;
  const result = format(source, { maxLineLength: 65 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /not\(factory\(worker\)\.make\(\n/);
  assert.match(result.formatted, /state\.authority\.liveSnapshot\n        \)\)/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 65 }), result);
});

test("preserves parenthesized call arguments when wrapping", () => {
  const source = `module Demo {\n  val result = match value {\n    | Some(v) => all {\n      not(factory(worker).make((worker), observed.stageId, (observed.fence)))\n    }\n    | _ => fallback\n  }\n}\n`;
  const result = format(source, { maxLineLength: 40 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /factory\(worker\)\.make\(\n/);
  assert.match(result.formatted, /\(worker\),\n/);
  assert.match(result.formatted, /\(observed\.fence\)\n        \)\)/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 40 }), result);
});

test("limits call wrapping to comment-free multiline match arms", () => {
  const outsideMatch = `module Demo {\n  val result = c1GrantFor(worker, observed.stageId, observed.fence, state.authority.liveSnapshot)\n}\n`;
  const oneLineMatch = `module Demo {\n  val result = match value { | Some(v) => c1GrantFor(worker, observed.stageId, observed.fence, state.authority.liveSnapshot) }\n}\n`;
  const commentedArm = `module Demo {\n  val result = match value {\n    | Some(v) => c1GrantFor(worker, observed.stageId, observed.fence, state.authority.liveSnapshot) // keep\n    | _ => fallback\n  }\n}\n`;
  const leadingComment = `module Demo {\n  val result = match value {\n    | Some(v) => /* keep */ c1GrantFor(worker, observed.stageId, observed.fence, state.authority.liveSnapshot)\n    | _ => fallback\n  }\n}\n`;
  for (const source of [outsideMatch, oneLineMatch, commentedArm, leadingComment]) {
    const result = format(source, { maxLineLength: 80 });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.doesNotMatch(result.formatted, /c1GrantFor\(\n/);
    if (source === commentedArm || source === leadingComment) assert.match(result.formatted, /keep/);
    assert.deepEqual(format(result.formatted, { maxLineLength: 80 }), result);
  }
});

test("treats every line spanned by a block comment as a call-wrap barrier", () => {
  const source = `module Demo {\n  val result = match value {\n    | Some(v) => all {\n      /* keep\n      */ longCall(firstLongArgument, secondLongArgument, thirdLongArgument)\n    }\n    | _ => fallback\n  }\n}\n`;
  const result = format(source, { maxLineLength: 60 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\*\/ longCall\(firstLongArgument, secondLongArgument, thirdLongArgument\)/);
  assert.doesNotMatch(result.formatted, /longCall\(\n/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 60 }), result);
});

test("keeps full-clause alignment when wrapping a match-arm call", () => {
  const source = `module Demo {\n  val result = match value {\n    | Some(v) =>\n      extraordinarilyLongPredicateName == ExpectedValue\n      and short == longCall(firstLongArgument, secondLongArgument, thirdLongArgument)\n    | _ => false\n  }\n}\n`;
  const result = format(source, { clauseAlignment: "full", maxLineLength: 70 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /and short\s+== longCall\(\n/);
  assert.deepEqual(format(result.formatted, { clauseAlignment: "full", maxLineLength: 70 }), result);
});

test("keeps Boolean clause groups stable after a wrapped call", () => {
  const source = `module Demo {\n  val result = match value {\n    | Some(v) =>\n      extraordinarilyLongPredicateName == ExpectedValue\n      and short == longCall(firstLongArgument, secondLongArgument, thirdLongArgument)\n      and mediumName == FinalValue\n    | _ => false\n  }\n}\n`;
  for (const clauseAlignment of ["operator", "full"] as const) {
    const result = format(source, { clauseAlignment, maxLineLength: 70 });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.match(result.formatted, /longCall\(\n/);
    assert.deepEqual(format(result.formatted, { clauseAlignment, maxLineLength: 70 }), result);
  }
});

test("wraps a call made oversized by full-clause alignment", () => {
  const source = `module Demo {\n  val result = match value {\n    | Some(v) =>\n      extraordinarilyLongPredicateName == ExpectedValue\n      and x == longCall(firstArgument, secondArgument, thirdArgument)\n    | _ => false\n  }\n}\n`;
  const result = format(source, { clauseAlignment: "full", maxLineLength: 70 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /and x\s+== longCall\(\n/);
  assert.deepEqual(format(result.formatted, { clauseAlignment: "full", maxLineLength: 70 }), result);
});

test("propagates same-line match closures through the layout stack", () => {
  const source = `module Demo {\n  val result = match outer {\n    | A =>\n      val inner = match value {\n        | B => true\n      } inner }\n  val after = 1\n}\n`;
  const result = format(source, { maxLineLength: 200 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\n  val after = 1\n}/);
  assert.deepEqual(format(result.formatted, { maxLineLength: 200 }), result);
});

test("keeps multiline definition parameter state local across comments and later definitions", () => {
  const source = `module Demo {\n  pure def f(\n    first: int,\n    second: int\n  ): int = /* explanation\n  */ first + second\n  val after = 1\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\*\/ first \+ second\n  val after = 1\n}/);
  assert.deepEqual(format(result.formatted), result);
});

test("indents a final parameter that shares its line with the closing parenthesis", () => {
  const source = `module Demo {\n  pure def f(\n    first: int,\n    second: int): int = first + second\n  val after = 1\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\n    second: int\): int = first \+ second\n\n  val after = 1/);
  assert.deepEqual(format(result.formatted), result);
});

test("full clause alignment preserves lambda arrows in Boolean clauses", () => {
  const source = `module Demo {\n  pure def canAccept(actuator: ActuatorState, request: Request): bool =\n    request.capability == Accepted\n    and request.stageId == CurrentStage\n    and not(actuator.acceptances.exists(acceptance => acceptance.capabilityId == request.capability.id))\n}\n`;
  const result = format(source, { clauseAlignment: "full" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /acceptances\.exists\(acceptance => acceptance\.capabilityId == request\.capability\.id\)/);
  assert.deepEqual(format(result.formatted, { clauseAlignment: "full" }), result);
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
