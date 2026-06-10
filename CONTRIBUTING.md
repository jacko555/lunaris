# CONTRIBUTING.md

Thanks for helping build LUNARIS! 🌗

## Ground rules

1. **Sign the CLA** (first PR will prompt via CLA-assistant). Why: it grants the project a perpetual, irrevocable, sublicensable license to your contribution so we can (a) relicense if ever needed and (b) ship a future paid Steam build while the web game stays free and the code stays MIT. You keep copyright. This is the Audacity/MuseScore model.
2. **Code is MIT; assets are separately licensed.** Don't vendor GPL code; don't add copyrighted art/audio.
3. **sim-core is sacred:** deterministic, DOM-free, data-driven. Read CLAUDE.md before touching it.
4. **Numbers need sources.** New physical constants/figures go into `data/base/constants.json` with `source` + `as_of`, and a row in docs/SDD.md.

## How to contribute

- 🐛 Bugs: open an issue with seed + save export (reproducibility is built in — use it).
- 🧪 Content: buildings/tech/events are JSON — the easiest entry point. Validate with `pnpm schema-check`.
- 🔬 Science review: spot a wrong constant or a better paper? Issue with the citation = gold-tier contribution.
- 💻 Code: pick a TASKS.md checkbox in the current milestone; comment on the tracking issue first.

## PR checklist

- [ ] `pnpm lint && pnpm test` green
- [ ] Golden-hash changes explained in the PR description
- [ ] Docs updated if behavior changed
- [ ] Conventional commit messages

## Conduct

Standard Contributor Covenant. Be kind; argue with citations.

## CLA (summary text — full text in /legal/CLA.md)

"You grant the LUNARIS maintainer a perpetual, worldwide, non-exclusive, irrevocable, royalty-free, sublicensable copyright license to use, modify, distribute, and relicense your contribution as part of the project. You retain copyright and all other rights. You confirm the contribution is your original work."
