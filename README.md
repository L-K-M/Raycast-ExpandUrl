# Expand URL

A Raycast extension that expands shortened URLs **one hop at a time**, showing
you the whole redirect chain instead of just where it ends up.

Most unshorteners take `bit.ly/xyz` and hand back the final page. That throws
away the interesting part. A link often passes through several tracking domains
before it lands, the redirect worth seeing is frequently hop 2 rather than the
last one, and some links — unsubscribe links, magic login links, password
resets — are consumed the moment you follow them to the end.

So this extension shows every hop, lets you copy any of them, and lets you stop
whenever you like.

## Commands

**Expand URL** — the chain explorer. Launch it, paste a URL, press `⏎`. Every
hop appears as its own row with its status code, and the detail pane breaks the
selected URL into host, path and one row per query parameter, with tracking
parameters flagged in red.

You can also pass a URL directly: `Expand URL https://bit.ly/xyz` from Raycast's
root search.

Launch it with an empty search bar and you get **Recently Expanded** instead of
a blank screen — the last 15 URLs you expanded, each re-expandable with `⏎`.
That list lives on your machine and can be cleared or switched off.

**Expand URL in Clipboard** — the shortcut for when you only want the answer.
Expands whatever URL is on the clipboard, copies the destination back, and
reports what happened in a HUD.

## Step by step vs full chain

Set **Expansion Mode** in preferences.

**Full chain** (default) walks the whole chain at once, streaming each hop into
the list as it resolves.

**Step by step** resolves exactly one hop per keypress. This mode exists for a
specific reason: resolving a hop reveals the _next_ URL without requesting it,
because that URL comes out of the current hop's `Location` header. So you can
see where an unsubscribe link points without visiting it and using it up.

Either mode can switch mid-chain — `⌘⇧→` finishes a stepped chain in one go,
`⌘.` stops a running one.

## Actions

Available on any hop, not just the last one:

| Shortcut      | Action                                               |
| ------------- | ---------------------------------------------------- |
| `⏎`           | Copy URL                                             |
| `⌘⇧C`         | Copy URL without tracking parameters                 |
| `⌘⇧⏎`         | Copy the final URL                                   |
| `⌘⇧M` / `⌘⇧T` | Copy the whole chain as Markdown or plain text       |
| `⌘O` / `⌘⇧O`  | Open in browser, with or without tracking parameters |
| `⌘→` / `⌘⇧→`  | Expand one more step / all remaining                 |
| `⌘R`          | Restart expansion from this hop                      |
| `⌘Y`          | Toggle the detail pane                               |

## Tracking parameters

`utm_*`, `fbclid`, `gclid`, `mc_eid` and friends are flagged and strippable by
default. A second, opt-in tier (**Also strip contextual parameters**) covers
`ref`, `s`, `si`, `source` and `trk` — these are off by default because they
genuinely carry meaning on some sites, and stripping them would hand you a
broken link.

## Preferences

| Preference          | Default    | What it does                                                                      |
| ------------------- | ---------- | --------------------------------------------------------------------------------- |
| Expansion Mode      | Full chain | Full chain or step by step                                                        |
| Automatic Expansion | On         | Expand as soon as a URL is available. Off means nothing is requested without `⏎`. |
| Clipboard           | On         | Prefill the search bar when the clipboard holds a URL                             |
| Meta Refresh        | On         | Treat a short `<meta http-equiv="refresh">` as a redirect                         |
| Private Hosts       | On         | Refuse redirects into your own network or to cloud metadata endpoints             |
| Tracking Parameters | Off        | Also strip the contextual tier                                                    |
| User Agent          | Chrome     | Many shorteners reject unrecognised agents; an honest Raycast agent is offered    |
| Maximum Hops        | 20         | Stop after this many hops                                                         |
| Request Timeout     | 10s        | Per-hop timeout                                                                   |
| History             | On         | Remember the last 15 expanded URLs, shown when the search bar is empty            |

## What it does not do

- **Run JavaScript.** A page that redirects via `location.href = …` ends the
  chain where it stands. There is no browser here.
- **Keep cookies between hops.** Shorteners that need a session terminate early.
- **Reach into your network.** Redirects to loopback, private, link-local and
  cloud-metadata addresses are refused, checked at the moment the socket opens
  so DNS rebinding cannot slip past. Turn this off in preferences only if you
  are deliberately expanding internal URLs.

Nothing is sent anywhere else: every request goes straight from your machine to
the host in the chain, with no cookies and no `Authorization` header.

## Development

```bash
npm install
npm run dev     # requires the Raycast app
npm test
```

See [`AGENTS.md`](AGENTS.md) for contributor and agent notes, and
[`PLAN.md`](PLAN.md) for the design.

> LLM Disclosure: This project is being developed with assistance from large
> language models (AI coding tools).

## License

Released under the [Unlicense](LICENSE). Note that the Raycast Store requires
extensions to be MIT-licensed, so this extension is not submittable as-is; see
`AGENTS.md`.
