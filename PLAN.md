# Expand URL — Technical & UX Plan

A Raycast extension that expands shortened and redirecting URLs **one hop at a
time**, exposing the entire redirect chain instead of only the final
destination.

---

## 1. Product goal

Existing "unshorten" tools answer the wrong question. They take
`https://bit.ly/xyz` and hand back `https://example.com/article?utm_source=…`,
throwing away everything in between. That intermediate chain is often the
interesting part:

- A link may pass through three different tracking domains before landing.
- The interesting redirect may be hop 2, not the final page.
- Some links are **single-use** (unsubscribe, magic-login, password reset).
  Following them to completion consumes them.
- The final URL is frequently laden with tracking parameters the user wants
  stripped.

So the extension is built around three commitments:

1. **Never silently swallow the chain.** Every hop is a first-class, selectable,
   copyable object.
2. **The user controls how far expansion goes.** A step-by-step mode issues
   exactly one network request per explicit keystroke.
3. **Every hop is actionable.** Copy, open, paste, strip tracking parameters,
   or restart expansion from that hop.

### Non-goals

- Executing JavaScript. Client-side (`location.href = …`) redirects are not
  followed; the chain simply terminates at the page that would have performed
  them. Documented, not worked around.
- Rendering page contents. This is a URL tool, not a browser.
- Persisting cookies across hops. Shorteners that require a session will
  terminate early; documented as a known limitation.

---

## 2. UX design

### 2.1 Commands

| # | Name (manifest) | Title | Mode | Purpose |
|---|---|---|---|---|
| 1 | `expand-url` | Expand URL | `view` | The chain explorer. The primary experience. |
| 2 | `expand-clipboard-url` | Expand URL in Clipboard | `no-view` | One-shot: expand the clipboard URL, copy the final URL, HUD the summary. |

Command 1 takes an optional `url` argument, so `Expand URL <paste>` works
directly from Raycast's root search. It also accepts `fallbackText`, so typing a
URL into root search and picking the command as a fallback works.

Command 2 exists because "just give me the answer" is a legitimate, *explicitly
chosen* mode. It is a separate command precisely so the default experience never
does this implicitly.

### 2.2 Main view anatomy

The whole command is a single `<List>` with `filtering={false}`, where **the
search bar is the URL input**. This is the fastest possible Raycast-native
interaction: launch, paste, `⏎`.

```
┌────────────────────────────────────────────────────────────────┐
│ 🔗 https://bit.ly/3xAmPl3                                      │  ← search bar = URL input
├────────────────────────────────────────────────────────────────┤
│ Expand                                                         │
│   ▸ Expand This URL                            bit.ly       ⏎  │  ← only while input ≠ expanded source
├────────────────────────────────────────────────────────────────┤
│ Redirect Chain · 4 hops · 2 trackers                           │
│   1  https://bit.ly/3xAmPl3                     Start · 301    │
│   2  https://t.co/aBcDeF                             301       │
│   3  https://example.com/article?utm_source=x        200       │
│      ⏎ Expand Next Step                                        │  ← step mode only
└────────────────────────────────────────────────────────────────┘
```

**Selection detail pane** (`isShowingDetail`, toggleable with `⌘Y`) shows
`List.Item.Detail.Metadata` for the highlighted hop:

- Full URL (wrapped, selectable)
- Scheme · Host · Path
- **Query parameters, one row per parameter**, with tracking parameters tagged
  in red. This alone justifies the detail pane — it makes `utm_*` soup legible.
- HTTP status + status text, request method (`HEAD`/`GET`), redirect kind
  (`HTTP 301` / `meta refresh`), elapsed ms, `content-type`, `server`
- Document `<title>` for the terminal hop, when available

### 2.3 Expansion modes

Set by the `expansionMode` preference, overridable at runtime from the action
panel.

| Mode | Behaviour |
|---|---|
| **Full chain** (default) | On submit, walks the chain to completion, streaming each hop into the list as it resolves. The user watches it build; nothing is hidden. |
| **Step by step** | Resolves exactly one hop, then stops with a visible `Expand Next Step` affordance. Each `⏎` issues exactly one request. |

Both modes render the identical chain UI — the only difference is who drives the
loop. A run started in full-chain mode can be stopped (`⌘.`); a run started in
step mode can be completed in one go (`⌘⇧→`).

### 2.4 Actions

Per-hop action panel, grouped into sections:

**Copy**
| Action | Shortcut |
|---|---|
| Copy URL | `⌘C` |
| Copy URL Without Tracking Parameters | `⌘⇧C` |
| Copy Final URL | `⌘⇧⏎` |
| Copy Chain as Markdown | `⌘⇧M` |
| Copy Chain as Plain Text | `⌘⇧T` |
| Paste URL to Active App | `⌘V` |

**Expand**
| Action | Shortcut |
|---|---|
| Expand Next Step | `⏎` (step mode, when pending) |
| Expand All Remaining | `⌘⇧→` |
| Stop Expanding | `⌘.` |
| Restart From This Hop | `⌘R` |

**Open**
| Action | Shortcut |
|---|---|
| Open in Browser | `⌘O` |
| Open Without Tracking Parameters | `⌘⇧O` |
| Create Quicklink | — |

**View**
| Action | Shortcut |
|---|---|
| Toggle Details | `⌘Y` |
| Clear History | `⌃⇧X` |

`Copy URL` is deliberately the primary (`⏎`-adjacent) action on a resolved hop,
because copying an intermediate URL is the whole point of the extension.

### 2.5 Empty & error states

- **No input** → `List.EmptyView` "Paste a URL to expand", plus a **Recent
  Expansions** section (last 15, `LocalStorage`-backed) so the empty state is a
  launchpad rather than a dead end. History is disableable and clearable.
- **Invalid input** → non-blocking hint in the empty view; no request is made.
- **Blocked host** (private/loopback) → the hop renders with a red icon and an
  explanatory reason. It is a result, not a crash.
- **Network error / timeout** → the hop that failed is retained in the chain with
  its error text, and a `Retry` action is offered. Partial chains are never
  discarded.

### 2.6 Preferences

| Name | Type | Default | Rationale |
|---|---|---|---|
| `expansionMode` | dropdown (`full`, `step`) | `full` | Section 2.3 |
| `autoExpandOnLaunch` | checkbox | `true` | When a URL arrives via argument/clipboard, start immediately. Off = never touch the network unprompted. |
| `readClipboard` | checkbox | `true` | Prefill the search bar from the clipboard. Privacy opt-out. |
| `maxHops` | textfield | `20` | Runaway/loop guard. |
| `timeoutMs` | textfield | `10000` | Per-request timeout. |
| `userAgent` | dropdown (`chrome`, `safari`, `raycast`) | `chrome` | Many shorteners 403 unknown agents. Section 3.5. |
| `followMetaRefresh` | checkbox | `true` | Section 3.3. |
| `blockPrivateHosts` | checkbox | `true` | Section 3.6. |
| `stripAggressively` | checkbox | `false` | Section 3.4. |
| `keepHistory` | checkbox | `true` | Privacy opt-out. |

---

## 3. Technical design

### 3.1 Module layout

```
src/
  expand-url.tsx              # Command 1 — view
  expand-clipboard-url.ts     # Command 2 — no-view
  tools/
    expand-url.ts             # AI tool entry point
  components/
    ChainList.tsx             # <List> rendering of a Chain
    HopDetail.tsx             # List.Item.Detail metadata for one Hop
    HopActions.tsx            # ActionPanel for one Hop
  hooks/
    useExpansion.ts           # React state machine driving the engine
    useHistory.ts             # LocalStorage-backed recents
  lib/                        # ← zero Raycast imports; pure & unit-testable
    types.ts                  # Hop, Chain, ChainStatus, ExpandOptions
    url.ts                    # parse / normalise / extract-from-text
    tracking.ts               # tracking-parameter classification & stripping
    html.ts                   # meta-refresh + <title> extraction
    guards.ts                 # scheme + private-host checks
    expand.ts                 # resolveHop() / expandChain() async generator
    format.ts                 # chain → markdown / plain text
  preferences.ts              # typed, validated preference access
test/
  *.test.ts                   # vitest, targeting src/lib/** exclusively
```

The hard rule: **`src/lib/**` never imports `@raycast/api`.** That keeps the
entire expansion engine testable under plain Node with vitest, with no Raycast
runtime, no mocking of the Raycast host, and no macOS requirement in CI.

### 3.2 Core types

```ts
export type HopVia = "start" | "http" | "meta-refresh";

export interface Hop {
  index: number;
  url: string;
  via: HopVia;              // how we arrived at this URL
  status?: number;          // HTTP status of the response for this URL
  statusText?: string;
  method?: "HEAD" | "GET";
  contentType?: string;
  server?: string;
  elapsedMs?: number;
  documentTitle?: string;   // terminal HTML hops only
  trackingParams?: string[];
  error?: string;           // this hop failed; chain stops here
}

export type ChainStatus =
  | "idle"      // nothing requested yet
  | "running"   // a request is in flight
  | "paused"    // step mode, a next hop exists and awaits the user
  | "final"     // terminal response reached
  | "max-hops"  // stopped at maxHops
  | "loop"      // a URL repeated
  | "stopped"   // user cancelled
  | "error";    // last hop failed

export interface Chain {
  source: string;
  hops: Hop[];
  status: ChainStatus;
  message?: string;
}
```

### 3.3 The hop resolution algorithm

`resolveHop(url, options, signal)` — one URL in, one `HopResult` out:

1. **Guard** the URL (§3.6). A rejected URL yields a terminal hop carrying the
   reason; it never throws.
2. **`HEAD`** with `redirect: "manual"`, `signal: AbortSignal.any([userSignal,
   AbortSignal.timeout(timeoutMs)])`. Verified: Node/undici returns the real 3xx
   response with a readable `location` header (unlike browsers, which return an
   opaque redirect).
3. **3xx + `location`** → next URL is `new URL(location, currentUrl)`, resolving
   relative redirects. `via: "http"`. Done.
4. **405 / 501 / 403, or 2xx with meta-refresh checking enabled** → retry with
   `GET`. Many hosts reject `HEAD` outright, and meta refresh needs a body.
   `GET` bodies are read through a **byte-capped reader** (default 64 KiB) and
   the stream is then cancelled — we never download a 4 GB ISO to look for a
   `<meta>` tag.
5. **HTML body** → extract `<meta http-equiv="refresh" content="0; url=…">`
   (delay ≤ `metaRefreshMaxDelay`, default 5 s) and `<title>`. A qualifying
   refresh yields `via: "meta-refresh"`.
6. **Anything else** (2xx without refresh, 4xx, 5xx) → terminal. 4xx/5xx are
   *reported*, not treated as failures: "hop 3 returns 404" is a useful answer.

`expandChain()` is an **async generator** yielding a fresh `Chain` snapshot after
each hop. The UI re-renders per yield, which is what produces the streaming
build-up in full-chain mode, and the generator's natural pause point is exactly
what step mode needs. One implementation serves both modes.

Termination conditions: terminal response · `hops.length >= maxHops` · repeated
normalised URL (loop) · abort · guard rejection.

### 3.4 Tracking-parameter handling

`tracking.ts` classifies query parameters against two tiers:

- **Conservative** (default, unambiguous): `utm_*`, `fbclid`, `gclid`, `gbraid`,
  `wbraid`, `msclkid`, `dclid`, `twclid`, `yclid`, `igshid`, `mc_cid`, `mc_eid`,
  `mkt_tok`, `_hsenc`, `_hsmi`, `vero_id`, `oly_*`, `__s`, `wickedid`,
  `_openstat`, `at_*`.
- **Aggressive** (opt-in, contextual): `ref`, `ref_src`, `ref_url`, `s`, `si`,
  `source`, `trk`, `cmpid`, `spm`.

The second tier is opt-in because `?ref=` and `?s=` genuinely carry meaning on
some sites; stripping them by default would produce broken URLs.

`stripTrackingParams(url, { aggressive })` returns `{ url, removed }`, preserving
parameter order for everything it keeps and leaving the URL untouched when
nothing matches (no gratuitous re-encoding).

### 3.5 User agent

Shorteners and CDNs routinely 403 unrecognised agents, so a plausible desktop
browser UA is required for the tool to work at all. The preference makes this
explicit and reversible, offering an honest `Raycast Expand URL/<version>` option
for users who prefer not to spoof. Default: Chrome, because it is what actually
works. `Accept: */*`, `Accept-Language: en-US,en;q=0.9`, no cookies sent, no
cookies stored.

### 3.6 Safety guards

The extension follows **attacker-controllable** redirects, so the target of hop
*n+1* is chosen by whoever controls hop *n*. Guards, in `guards.ts`:

- **Scheme allow-list**: `http:` and `https:` only. A redirect to
  `file:`/`javascript:`/`data:` terminates the chain with a visible reason.
- **Private-host blocking** (default on): before each request, resolve the
  hostname with `node:dns/promises` and reject loopback, link-local
  (`169.254/16`, `fe80::/10`), private (`10/8`, `172.16/12`, `192.168/16`,
  `fc00::/7`), CGNAT (`100.64/10`), and unspecified addresses, plus literal-IP
  and `localhost` / `*.local` / `*.internal` forms. This blocks the classic
  "public shortener redirects to `http://169.254.169.254/`" pivot.
  A TOCTOU window remains between our resolution and undici's — documented in
  `AGENTS.md` as a known, accepted limitation rather than papered over.
- **Response caps**: 64 KiB read ceiling, per-request timeout, `maxHops` ceiling,
  loop detection.
- **No credential forwarding**: `Authorization`/`Cookie` are never set, so
  nothing is leaked to hop *n+1*.

### 3.7 Toolchain

Verified working headless on Linux CI (`@raycast/api` ships a `linux-x64` `ray`
binary; neither `lint` nor `build` requires the Raycast app or a login):

| Script | Command |
|---|---|
| `dev` | `ray develop` |
| `build` | `ray build -e dist` |
| `lint` | `ray lint` |
| `fix-lint` | `ray lint --fix` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `format` | `prettier --check .` |

ESLint 9 flat config (`eslint.config.mjs`) extending `@raycast/eslint-config`;
Prettier 3; TypeScript 5 `strict`.

### 3.8 CI/CD

`.github/workflows/ci.yml` — on push and PR, `ubuntu-latest`, Node 22:
`npm ci` → `format` → `lint` → `typecheck` → `test` → `build`. Concurrency-grouped
and cancel-in-progress.

`.github/dependabot.yml` — weekly npm + GitHub Actions updates.

`.github/workflows/release.yml` — manual dispatch: re-runs the full gate, then
attaches the built extension to a GitHub Release.

Store publication (`ray publish`) requires an interactive Raycast login and
cannot run in CI; it stays a documented manual step in `AGENTS.md`. Likewise,
the six 2000×1250 `metadata/` screenshots the Raycast Store requires must be
captured from a real Raycast window on macOS — CI cannot fabricate them, so the
repo ships a `metadata/README.md` describing exactly what to capture instead of
placeholder images.

---

## 4. Delivery plan

One PR per step, against `main`, each awaiting GLM review before merge.

| PR | Scope | Definition of done |
|---|---|---|
| 1 | **This plan** | `PLAN.md` merged. |
| 2 | **Scaffolding & CI** | Manifest, tsconfig, ESLint/Prettier, generated 512×512 icon, vitest, CI workflow, a command that renders. `lint`+`build`+`test` green. |
| 3 | **Expansion engine** | `lib/{types,url,tracking,html,guards,expand,format}.ts` + thorough vitest suite against a local `http.Server`. No UI change. |
| 4 | **Chain view** | `expand-url` command: streaming full-chain expansion, chain list, detail metadata, copy/open actions. |
| 5 | **Step mode & preferences** | Step-by-step expansion, runtime mode toggle, stop/restart, all preferences wired and validated. |
| 6 | **Clipboard command & history** | `expand-clipboard-url`, `LocalStorage` recents in the empty state. |
| 7 | **AI tool** | `src/tools/expand-url.ts` + `ai.yaml`, so Raycast AI can expand URLs and report chains. |
| 8 | **Docs & collaterals** | `README.md` (users), `AGENTS.md` (LLMs), `CHANGELOG.md` (store format), `metadata/README.md`, release workflow, dependabot, PR template. |

Adjacent steps may be combined if reviews are consistently clean; steps will be
split further if a review surfaces enough work to warrant it.
