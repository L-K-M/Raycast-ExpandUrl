# Store screenshots

The Raycast Store wants 3–6 screenshots here, as **2000×1250 PNG** files named
`expand-url-1.png`, `expand-url-2.png`, and so on.

They are deliberately absent rather than stubbed. They have to be captured from
a real Raycast window on macOS or Windows, and CI runs on Linux without the
Raycast app — a placeholder image would only look like the job was done.

Capture them with Raycast's own **Window Capture** command, which produces the
right dimensions and background automatically.

## What to capture

Lead with what makes this extension different from every other unshortener: the
chain stays visible.

1. **A multi-hop chain, fully expanded.** The whole point. Pick a link that
   passes through two or three distinct hosts so the rows show different
   domains, not just different paths.
2. **The detail pane on a hop with tracking parameters.** One row per query
   parameter with the trackers flagged — this is the screenshot that explains
   the detail pane's existence.
3. **Step-by-step mode, paused.** The next hop's URL visible but not yet
   requested, with `Expand Next Step` in view. Shows the safety property that
   full-chain mode cannot.
4. **The action panel open on an intermediate hop.** Makes it obvious that every
   hop is copyable, not just the last one.
5. _(optional)_ A chain that ends in a redirect loop or a 404, showing that
   failures are reported as results rather than as errors.

## Rules

- Use a consistent background across all shots
- No personal data in URLs, page titles or the visible clipboard
- No other applications in frame
- Prefer a link whose destination is unambiguously safe for a public listing
