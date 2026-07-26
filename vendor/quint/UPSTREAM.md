<!-- provenance: agent-authored; created: 2026-07-27 -->
# Vendored Quint grammar

Source: `quint-co/quint`, commit
[`4e6a580ef40d96914fcebe4e1b4ae95f34c2a75e`](https://github.com/quint-co/quint/tree/4e6a580ef40d96914fcebe4e1b4ae95f34c2a75e),
retrieved 2026-07-27. The upstream project is Apache-2.0.

`Quint.g4` is a source copy with two mechanical formatter changes:

- whitespace and ordinary comments use ANTLR's hidden channel rather than being
  discarded;
- the generated parser's `quintError` import is redirected to this package's
  compatibility shim.

Do not update the grammar without changing this snapshot record and running the
compatibility corpus.
