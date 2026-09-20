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
  expand-url.tsx            # view command — seeds from argument or fallbackText
  expand-clipboard-url.tsx  # view command — same explorer, forced clipboard read
  tools/expand-url.ts       # AI tool
  components/               # ChainExplorer (shared by both commands), ChainList,
                            #   HopDetail, HopActions
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
- **Raycast supplies `""` for a blank optional argument, not `undefined`.**
  `raycast-env.d.ts` types it as `string`, so `arguments.url ?? fallbackText`
  never falls through and `fallbackText` becomes unreachable — which silently
  disables the fallback-command path. Use `pickSeedText` (`lib/launch.ts`),
  which treats empty and whitespace as "not supplied".
- **`@raycast/no-ambiguous-platform-shortcut` only inspects inline object
  literals.** Any helper that returns `{ modifiers, key }` suppresses the rule
  everywhere it is used. `HopActions.tsx`'s helper emits
  `{ macOS, Windows }` so call sites are correct by construction rather than
  merely unlinted.

## Raycast reachability

**No manifest field makes a command reachable by pasting a URL into root
search.** Raycast matches commands by name; arbitrary root-search text only
reaches an extension through _fallback commands_, which the **user** registers
(gear icon on the fallback row, or Settings → Extensions → Fallback Commands).
`expand-url` already reads `props.fallbackText`, so it works the moment it is
registered — but the setup step is the user's, and the README has to say so.

**Neither command may collapse the chain to its destination.** The clipboard
command was originally `no-view`: expand fully, copy the last URL, show a HUD.
That is the behaviour `PLAN.md §1` exists to rule out, and because it was the
command reachable by name, it quietly became the default path. Both commands now
render `ChainExplorer`. If a future change reintroduces a one-shot mode, it must
not be the easiest one to reach.

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

<!-- shared-rules:start -->

## Working practices

- Follow explicit task instructions over the default workflow below.
- Before editing, inspect the branch and working tree, fetch remote updates,
  and fast-forward where safe. Never overwrite existing work to update.
- Resolve ambiguity before making consequential changes. State low-risk
  assumptions; ask when scope, safety, or expected behavior is unclear.
- Keep changes focused. Do not modify unrelated code, formatting, or comments.
- Prefer surgical edits over whole-file rewrites when the result is equivalent.
- Stage only intended files. Inspect the diff before committing.

## Communication

- Be concise, factual, and direct. Preserve necessary context and uncertainty.
- Avoid praise, motivational filler, emojis, and em dashes in new prose.
- Address the reader directly in user-facing copy.
- Report what was verified and what remains unverified. Never imply that an
  unavailable check passed.

## Code design

- Prefer early returns and shallow nesting. Separate logical blocks with
  blank lines.
- Use descriptive constants or enums for meaningful or repeated values.
  Use existing standard definitions for protocol/specification constants.
  Keep obvious, one-off values inline.
- Use enums for behavioral modes that would otherwise require ambiguous
  boolean arguments.
- Default members to private. Widen visibility only for required consumers,
  and review the change as an API design decision.
- Follow the repository's declared dependency boundaries. UI and controllers
  must use application services rather than directly accessing databases,
  subprocesses, sockets, or other low-level mechanisms.
- Encapsulate low-level mechanics behind domain-oriented interfaces.
- Reuse genuinely shared logic. Avoid speculative abstractions and layers
  that only forward calls.
- Prefer pure functions for business rules and immutable data where practical.
  Isolate side effects; document non-obvious state ownership or synchronization.
- Explain non-obvious intent, constraints, and tradeoffs in comments.
  Do not narrate obvious code. Add examples or diagrams when they clarify it.

## Validation and errors

- Validate untrusted input at entry points. Where practical, represent valid
  states in types and enforce persistent invariants in database schemas.
- Represent absence and failure explicitly.
- Use assertions for internal programming invariants, not external-input
  validation or required runtime error handling.
- Prefer explicit, actionable errors over silent failure or undocumented
  fallback. Document intentional recovery behavior.
- Never report a skipped or failed operation as successful.

## Bug fixes

1. Identify the root cause and define an observable success criterion.
2. Add a regression test and observe the relevant failure before fixing it.
3. Implement the fix and observe the test passing.
4. Check surrounding behavior for regressions and architectural consistency.

If an automated regression test is impractical, document the reproduction
and verification procedure. State any inability to reproduce the failure.

## Verification

- Run relevant tests and lint after changes.
- Choose coverage by affected behavior and risk, not patch size.
- Use integration or end-to-end tests for critical workflows and boundaries;
  test isolated business rules at the lowest effective level.
- Run broader suites for cross-cutting or high-risk changes, and the full
  required release checks before releasing.
- Validate the requested command, options, platform, and configuration.
  Unrelated green CI is not proof that the reported problem is fixed.
- Recheck after the final edit. Distinguish local checks from CI results.

## Commit messages

- Use a capitalized, imperative subject without a final period.
- Target 50 characters; never exceed 72.
- Separate the subject and body with one blank line.
- Wrap body text at 72 characters.
- Explain what changed and why. Leave implementation mechanics to the code.

## Implementation and review

Unless explicitly instructed otherwise:

1. Work on a focused branch and open a PR against main.
2. Inspect CI results and completed review feedback for the latest commit.
   A successful reviewer job does not mean the review found no problems.
3. Address important findings or explain why they do not apply. Handle minor
   findings according to the stopping rules below.
4. Evaluate each fix in the surrounding project, add regression coverage,
   and rerun affected checks before pushing.
5. Repeat until a stopping criterion is met.
6. Merge without asking again once the stopping criterion is met, required
   checks pass on the latest commit, and no unresolved blockers or required
   human review requests remain.

### Reviewer context limits

The automated PR reviewer does not see the user's original prompt or
conversation. It may suggest changes that go against or beyond what the
user asked for. Do not implement such suggestions. Note each conflict and
report it to the user at the end of the thread.

### Automated review stopping rules

Judge findings by verified impact, not the reviewer's severity label.
Important findings concern correctness, security, data loss, broken builds,
or materially degraded behavior/performance.

Track completed review rounds and consecutive rounds without important
findings. Reruns of the same revision and integration failures do not count.

- No applicable actionable feedback: finish immediately.
- First minor-only round: optionally fix worthwhile, low-risk findings.
  Do not manufacture another push merely to obtain another review.
- Two consecutive rounds without important findings: stop responding to
  automated nitpicks, even if actionable minor suggestions remain.
  Defer worthwhile leftovers rather than continuing the cycle.
- A confirmed important finding resets the minor-only streak. Address it
  and verify the fix before continuing.

After ten completed rounds, enter stabilization:

- Stop optional cleanup, refactoring, and nitpick fixes.
- One completed review without confirmed important findings is sufficient
  to finish, even if minor suggestions remain.
- Continue only for confirmed important defects. If resolving them stalls,
  report the blockers rather than continuing indefinitely.

These limits end optional automated-feedback work. They do not waive
confirmed blockers, unresolved human review requests, or required checks.

### Reviewer integration failures

After two consecutive reviewer-integration failures, stop and report the
review gap. Do not treat failures as approval. An explicit user instruction
may waive review; report that waiver rather than claiming review passed.

## Completion checklist

- The requested behavior is implemented without unrelated changes.
- Relevant checks pass for the latest code.
- Important review findings are addressed or rejected with reasons.
- Deferred suggestions, remaining risks, and validation gaps are disclosed.
- The final response accurately states whether work is committed, pushed,
  and merged.

<!-- shared-rules:end -->
