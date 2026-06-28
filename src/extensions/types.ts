import type { Capability } from "./manifest";

/**
 * Shared types for the UI extension system.
 *
 * The system is modelled on VS Code: an extension ships a declarative manifest
 * (`extension.json`, see `manifest.ts`) describing *contribution points*, and the
 * Agent-Canvas shell renders those contributions natively. Extension *logic* (when
 * present) runs isolated in a Web Worker and talks to the host over RPC.
 *
 * This module holds the **runtime** shapes the host works with after a manifest has
 * been parsed and its assets resolved — distinct from the on-disk manifest schema in
 * `manifest.ts`.
 */

/**
 * Declarative triggers that cause an extension's worker to be activated, mirroring
 * VS Code activation events. `"*"` / `"onStartup"` activate eagerly; the others are
 * lazy.
 */
export type ActivationEvent =
  | "*"
  | "onStartup"
  | `onCommand:${string}`
  | `onView:${string}`;

/**
 * A resolved Activity Bar (sidebar rail) item contributed by an extension. The host
 * renders this as a button on the rail; selecting it dispatches the extension's
 * configured activation/selection behaviour via `onSelect`.
 */
export interface ActivityBarItem {
  /** Owning extension id (e.g. `"acme.compliance"`). */
  extensionId: string;
  /** Container id from `contributes.viewsContainers.activitybar[].id`. */
  id: string;
  /** Human-readable label / tooltip. */
  title: string;
  /**
   * Resolved icon URL (typically a `blob:` URL minted from the bundle). Optional —
   * the host falls back to a default glyph when absent so a malformed/missing icon
   * never breaks the rail.
   */
  iconUrl?: string;
  /** Invoked when the user selects the item. Wired by the loader/host. */
  onSelect: () => void;
}

/** A resolved command contributed by an extension (surfaced in the Command-K menu). */
export interface CommandItem {
  extensionId: string;
  /** Fully-qualified command id, e.g. `"compliance.scan"`. */
  command: string;
  /** Human-readable title shown in the command menu. */
  title: string;
  /** Invoked when the command runs. Wired by the loader/host. */
  run: () => void | Promise<void>;
}

/** A resolved view (panel) contributed by an extension. */
export interface ViewItem {
  extensionId: string;
  /** View id from `contributes.views[container][].id`. */
  id: string;
  /** Container id this view belongs to. */
  containerId: string;
  /** Human-readable name. */
  name: string;
  /** Only `"webview"` is supported initially. */
  type: "webview";
  /** Resolved URL of the webview's HTML document (from the bundle). */
  pageUrl?: string;
  /** Capabilities granted to the owning extension (gates the webview's host API). */
  capabilities?: Capability[];
}

/**
 * A resolved menu item contributed by an extension into a named menu slot (see
 * `menu-slots.ts`). It binds to an existing contributed `command`; the host renders
 * the item declaratively and runs the bound command on selection. Showing it executes
 * no extension code, so no capability is required.
 */
export interface MenuItem {
  extensionId: string;
  /** Menu-slot id this item targets (e.g. `"conversationTabs/context"`). */
  menu: string;
  /** Id of the contributed command this item runs. */
  command: string;
  /** Display label, resolved from the bound command's title. */
  title: string;
  /** Optional ordering group within the slot (lower groups sort first). */
  group?: string;
  /**
   * Optional visibility clause evaluated against the host UI-context (see `when.ts`).
   * The host filters items by this before rendering; hiding one runs no extension
   * code. Absent means always visible.
   */
  when?: string;
  /** Invoked when the item is selected. Wired by the loader/host. */
  run: () => void | Promise<void>;
}

/**
 * The full set of resolved contributions for a single extension, handed to the
 * `ContributionRegistry` as one unit so registration/unregistration is atomic.
 */
export interface ExtensionContributions {
  activityBarItems?: ActivityBarItem[];
  commands?: CommandItem[];
  views?: ViewItem[];
  menus?: MenuItem[];
}
