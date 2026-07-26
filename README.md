<!-- provenance: agent-authored; created: 2026-07-27; updated: 2026-07-27 -->
# quintfmt

`quintfmt` is a conservative, comment-preserving formatter for
[Quint](https://quint-lang.org/). It validates source with a pinned Quint
grammar before formatting and fails without output on invalid source.

This initial release provides canonical spacing/indentation and restrained
local alignment for declarations, record fields, assignments, and relational
action clauses. Alignment never crosses comments, blank lines, nested layout,
or a twelve-column padding cap.

Declaration alignment keeps the colon with its name and aligns only type values
within a local `const`/`var` group:

```quint
const maxAttempts: int
var   owner:       str
var   phase:       Phase

def retryAllowed(s): bool
```

## Use

```sh
npm install
npm run build
node dist/src/cli.js Spec.qnt
node dist/src/cli.js --check Spec.qnt
node dist/src/cli.js --write Spec.qnt
```

`--write` and `--check` are mutually exclusive. With no file argument,
`quintfmt` reads stdin and writes formatted source to stdout.

## Guarantees

- significant token text and order are preserved;
- ordinary, documentation, and block comment text is preserved;
- formatting is idempotent;
- malformed source produces diagnostics and no partial output.

The parser is generated from a vendored Quint grammar snapshot. See
[vendor/quint/UPSTREAM.md](vendor/quint/UPSTREAM.md) for the exact upstream
commit and the narrow formatter patch. Quint evolves independently; this
project declares compatibility by that grammar snapshot.

## Deliberate limits

This first slice does not wrap long expressions, discover project
configuration, sort declarations/imports, reflow comments, or offer range/LSP
formatting. It preserves multiline block comments verbatim and treats them as
layout barriers.

## Development

```sh
npm test
```

## License

MIT. The vendored Quint grammar remains subject to its Apache-2.0 license.
