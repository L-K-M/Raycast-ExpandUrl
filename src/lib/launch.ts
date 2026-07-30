/**
 * Choosing the text a command starts from.
 *
 * This exists because of one sharp edge. Raycast types an **optional** command
 * argument as `string`, not `string | undefined` — check `raycast-env.d.ts` —
 * and supplies `""` when the user typed nothing. So the natural-looking
 *
 * ```ts
 * props.arguments.url ?? props.fallbackText
 * ```
 *
 * never falls through: `??` only skips `null` and `undefined`, so the empty
 * string wins and `fallbackText` becomes unreachable. That silently breaks the
 * fallback-command path, which is the only way a URL pasted into Raycast's root
 * search can reach this extension at all.
 */

/**
 * Returns the first candidate that has non-whitespace content.
 *
 * Treats `""` and whitespace as "nothing was supplied", which is what Raycast
 * means by them.
 */
export function pickSeedText(...candidates: (string | undefined | null)[]): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed !== undefined && trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}
