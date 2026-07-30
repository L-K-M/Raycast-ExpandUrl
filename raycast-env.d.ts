/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Expansion Mode - Full chain walks every redirect at once. Step by step issues exactly one request per keypress, so you can see where a link goes without following it. */
  "expansionMode": "full" | "step",
  /** Automatic Expansion - Start expanding as soon as a URL arrives from the argument or clipboard. Turn off to never make a request without pressing Enter. */
  "autoExpandOnLaunch": boolean,
  /** Clipboard - Prefill the search bar when the clipboard contains a URL. */
  "readClipboard": boolean,
  /** Meta Refresh - Treat a short <meta http-equiv="refresh"> as a redirect. Requires downloading part of the page. */
  "followMetaRefresh": boolean,
  /** Private Hosts - Refuse to follow redirects into your own network or to cloud metadata endpoints. Only turn this off if you are deliberately expanding internal URLs. */
  "blockPrivateHosts": boolean,
  /** Tracking Parameters - Also treat ref, s, si, source and trk as tracking parameters. These sometimes carry meaning, so removing them can break a link. */
  "stripAggressively": boolean,
  /** User Agent - Many shorteners reject unrecognised user agents. Raycast is the honest option; the browser options are the ones that work. */
  "userAgent": "chrome" | "safari" | "raycast",
  /** Maximum Hops - Stop after this many hops. Between 1 and 100. */
  "maxHops": string,
  /** Request Timeout - Seconds to wait for each hop. Between 1 and 120. */
  "timeoutSeconds": string,
  /** History - Keep a local list of the last 15 URLs you expanded, shown when the search bar is empty. Stored on this machine only. */
  "keepHistory": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `expand-url` command */
  export type ExpandUrl = ExtensionPreferences & {}
  /** Preferences accessible in the `expand-clipboard-url` command */
  export type ExpandClipboardUrl = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `expand-url` command */
  export type ExpandUrl = {
  /** URL */
  "url": string
}
  /** Arguments passed to the `expand-clipboard-url` command */
  export type ExpandClipboardUrl = {}
}

