import { List } from "@raycast/api";

/**
 * Placeholder shell for the chain explorer.
 *
 * The expansion engine lands in step 3 and this view is replaced in step 4;
 * this exists so the manifest resolves and `ray build` has an entry point to
 * compile from the moment CI is switched on.
 */
export default function Command() {
  return (
    <List searchBarPlaceholder="Paste a URL to expand…">
      <List.EmptyView title="Not Wired Up Yet" description="The redirect chain explorer arrives in a later step." />
    </List>
  );
}
