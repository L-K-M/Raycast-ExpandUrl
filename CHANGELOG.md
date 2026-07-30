# Expand URL Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Expand shortened and redirecting URLs while keeping every hop in the chain
  visible and copyable
- Step-by-step mode that resolves one hop per keypress, revealing the next URL
  without requesting it — so single-use links are not consumed
- Full-chain mode that streams hops into the list as they resolve
- Detail pane breaking each hop into host, path and one row per query parameter,
  with tracking parameters flagged
- Copy or open any hop, with or without tracking parameters; copy the whole
  chain as Markdown or plain text
- Follows HTTP redirects and short `<meta http-equiv="refresh">` redirects,
  resolving relative and protocol-relative targets
- Refuses redirects to loopback, private, link-local and cloud-metadata
  addresses, checked at connect time
- `Expand URL in Clipboard` command for one-shot expansion
- AI tool so Raycast AI can expand a URL and report its chain
