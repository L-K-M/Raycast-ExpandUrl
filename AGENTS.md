# AGENTS.md

Working notes for LLMs and other agents editing this repository. Terse on
purpose — read `PLAN.md` for the design rationale.

## What this is

A Raycast extension that expands shortened URLs **without** collapsing the
redirect chain to its destination. Every hop stays visible and copyable. The
design commitments in `PLAN.md §1` are the point of the project, not decoration:
if a change makes the chain less visible or makes requests the user did not ask
for, it is the wrong change.

## Commands

```
npm install
npm run dev          # ray develop — needs the Raycast app (macOS/Windows)
npm run build        # ray build; also regenerates raycast-env.d.ts
npm run lint         # ray lint --relaxed (see "Lint is relaxed" below)
npm run fix-lint
npm run format       # prettier --write .
npm run format:check
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:watch
```

CI runs `format:check → lint → build → generated-types drift → typecheck → test`
on Node 22. All of it runs headless on Linux; only `npm run dev` needs Raycast.

## Layout

```
src/
  expand-url.tsx            # view command — the chain explorer
  expand-clipboard-url.ts   # no-view command — expand clipboard, copy destination
  tools/expand-url.ts       # AI tool
  components/               # ChainList, HopDetail, HopActions
  hooks/useExpansion.ts     # drives the generator from React
  preferences.ts            # the only getPreferenceValues() call
  lib/                      # pure, Raycast-free, unit-tested
test/                       # vitest; helpers/server.ts is a local http.Server
```

## Rules that matter

**`src/lib/**` must never import `@raycast/api`.** That is what makes the engine
testable under plain Node with no Raycast runtime and no macOS. New logic goes in
`lib/` with tests; only rendering and Raycast API calls go outside it. When
something needs a preference _and_ wants tests, split it the way
`lib/settings.ts` (pure) and `preferences.ts` (plumbing) are split.

**Lint is relaxed, and tests make up for it.** `ray lint` hard-requires
`"license": "MIT"`; this project ships under the Unlicense, so lint runs
`--relaxed`. That also disables package.json schema, icon and store metadata
validation, so `test/manifest.test.ts` re-implements the parts we rely on
(URL-safe name, known categories/platforms, valid command modes and argument
types, an entry point on disk per command and tool, no title-repeating subtitle,
a genuinely 512×512 PNG icon). **If you add a manifest field, add its check
there.** Consequence: the extension is not submittable to the Raycast Store as
is. Relicensing to MIT is the only blocker and is the owner's call.

**`raycast-env.d.ts` is generated but committed.** Run `npm run build` after any
manifest change and commit the result; CI fails on drift.

**Pinned deps are pinned for a reason.** `@types/node` and `@types/react` are
_exact_ peer dependencies of `@raycast/api` — do not add carets. TypeScript must
stay `<6.1.0` (`@raycast/eslint-config`'s peer range), so TypeScript 7 is out.

## Traps already paid for

Each of these cost a debugging cycle and has a regression test. Do not
"simplify" them back.

- **`for await` discards a generator's return value.** `expandChain` therefore
  _yields_ its terminal snapshot as well as returning it. Remove the yield and
  every consumer silently gets a mid-flight chain.
- **TypeScript narrows repeated `signal?.aborted === true` checks to `false`.**
  The flag can flip during an intervening `await`, so abort checks go through
  `isAborted()`. Inlining them reintroduces the bug and the compiler will not
  complain the second time.
- **`new URL("http://[::ffff:127.0.0.1]/")` yields hostname `[::ffff:7f00:1]`.**
  Brackets survive (so `net.isIP()` returns `0`) and the IPv4 is re-encoded as
  hex (so string comparison finds nothing). `guards.ts` handles both.
- **Alternate IPv4 literals need no handling.** WHATWG `URL` already normalises
  `2130706433`, `0x7f000001` and `0177.0.0.1` to `127.0.0.1`. Adding a second
  decimal/octal/hex parser would _create_ a parser-differential bypass. There is
  a test asserting this so nobody adds one.
- **`nbsp` in `lib/html.ts` is a literal U+00A0**, not an ASCII space. Editors
  and naive find-and-replace will silently break it.
- **403 is in `HEAD_UNSUPPORTED`.** Not obviously a "method not allowed" code,
  but plenty of CDNs answer HEAD with 403 and GET with 200. Removing it
  dead-ends those chains.
- **Icon sources must be `Icon` enum members, not strings.** `Image.Source`
  accepts a `string` — as an _asset path_. `{ source: "lock-16" }` typechecks,
  builds, and silently renders nothing because `assets/lock-16` does not exist.
- **The re-entrancy guard in `useExpansion` is keyed by run id, not a boolean.**
  A superseded run can still be parked on an `await` when a new one starts; a
  plain boolean makes the new run a no-op, leaving the spinner up and nothing
  expanding.
- **`@raycast/no-ambiguous-platform-shortcut` only inspects inline object
  literals.** Any helper that returns `{ modifiers, key }` suppresses the rule
  everywhere it is used. `HopActions.tsx`'s helper emits
  `{ macOS, Windows }` so call sites are correct by construction rather than
  merely unlinted.

## Two CI traps

- **A conflicted PR silently skips CI.** `pull_request` workflows run against
  `refs/pull/N/merge`, which GitHub cannot compute when `mergeable_state` is
  `dirty`, so the run is never created — no failure, nothing to click.
  `pull_request_target` (the GLM review) checks out the base instead and keeps
  running, so the PR looks healthy with one check in flight. If CI seems to have
  stopped firing on pushes, check mergeability first.
- **Cutting a branch from a pre-squash branch causes exactly that.** Squash
  merges rewrite history, so a branch based on the unsquashed commit carries a
  duplicate of content already on `main`. Always branch from an up-to-date
  `origin/main`, and `git fetch origin main` before assuming your local copy is
  current.

## Security model

The extension follows redirects chosen by whoever controls the previous hop, so
treat it as an SSRF surface. `lib/guards.ts` holds the policy:

- scheme allow-list (`http:`/`https:` only)
- address checks run **inside the `lookup` passed to `http.request`**, with
  `all: true`, so they see exactly the addresses the socket will use — there is
  no resolve-then-trust window for DNS rebinding to race
- blocked ranges are matched by `net.BlockList` (Node's own parser — never
  hand-roll address parsing here); one bad address rejects the whole connection
- 64 KiB read cap, per-request timeout, `maxHops` ceiling, loop detection
- `Cookie` and `Authorization` are never sent, so nothing leaks to the next hop

`blockPrivateHosts` can be turned off in preferences; the scheme allow-list
cannot, and there is a test pinning that.

## Publishing

`CHANGELOG.md`'s `{PR_MERGE_DATE}` is deliberate, not an unsubstituted
template. It is the Raycast Store convention: their CI replaces it with the
real date when an extension pull request merges into `raycast/extensions`.
Replacing it with a hardcoded date would be the mistake.

`ray publish` needs an interactive Raycast login and cannot run in CI, so it is
a manual step. Before it would succeed: relicense to MIT, confirm `author`
matches the owner's Raycast username, and add the store screenshots described in
`metadata/README.md` (they must be captured from a real Raycast window; CI
cannot produce them).
