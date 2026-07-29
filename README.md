<!-- provenance: agent-authored; created: 2026-07-27; updated: 2026-07-30 -->
# quintfmt

`quintfmt` is a conservative, comment-preserving formatter for
[Quint](https://quint-lang.org/). It validates source with a pinned Quint
grammar before formatting and fails without output on invalid source.

This initial release provides canonical spacing/indentation, blank-line
separation for nontrivial definitions, and restrained local alignment for
declarations, record fields, assignments, and relational action clauses.
Alignment never crosses comments, blank lines, or nested layout. Record fields
align to their widest field by default; declaration and clause alignment remain
bounded by the configured sixteen-column padding cap.

Declaration alignment keeps the colon with its name and aligns only type values
within a local `const`/`var` group:

```quint
const maxAttempts: int
var   owner:       str
var   phase:       Phase

def retryAllowed(s): bool
```

## Install and use

```sh
npm install --global quintfmt
quintfmt Spec.qnt
```

> **Important:** `quintfmt Spec.qnt` rewrites `Spec.qnt` in place. Use
> `quintfmt --stdout Spec.qnt` to preview output, or `quintfmt --check Spec.qnt`
> for CI. With no file argument, it reads stdin and writes formatted source to
> stdout.

Without a global install:

```sh
npx quintfmt --stdout Spec.qnt
```

The library API is available to both CommonJS and ESM consumers:

```js
import { format } from "quintfmt"

const result = format('module Demo { var owner:str }')
if (result.ok) console.log(result.formatted)
```

Use `--declaration-alignment types` (the default), `columns`, or `off` to
choose declaration alignment. The same setting is available through the
`format(source, { declarationAlignment })` API.

See [Configuration and style](docs/CONFIGURATION.md) for the complete current
option contract and `.quintfmt.conf` project files.

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

This formatter does not yet wrap long expressions, sort declarations/imports,
reflow comments, or offer range/LSP formatting. It preserves multiline block
comments verbatim and treats them as layout barriers.

## Development

```sh
npm test
npm run check # includes an installed-tarball smoke test
```

## Releases

The release gate tests the packed npm artifact, including its executable,
CommonJS and ESM entry points. Formatter behavior and configuration defaults
are pre-1.0 and may change in minor releases; compatibility with Quint is tied
to the vendored grammar snapshot.

## License

MIT. The vendored Quint grammar remains subject to its Apache-2.0 license.
