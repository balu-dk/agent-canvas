import type { ActivationEvent } from "./types";

/**
 * On-disk extension manifest (`extension.json`) and its validator.
 *
 * Modelled on VS Code's `package.json` + `contributes`. The manifest is **pure data**
 * — declaring it can never execute extension code — so parsing/validating it is the
 * trust boundary for the declarative half of the system.
 *
 * Validation is hand-rolled (rather than pulling in a schema library) to keep the
 * extension subsystem dependency-free. It returns a discriminated result with
 * human-readable error paths so a malformed bundle fails loudly and safely.
 */

/** Capabilities an extension may request. The host gates RPC by these. */
export const KNOWN_CAPABILITIES = ["conversation:read", "storage"] as const;
export type Capability = (typeof KNOWN_CAPABILITIES)[number];

export interface ActivityBarContainerManifest {
  id: string;
  title: string;
  /** Relative path within the bundle to an icon asset (e.g. `"icon.svg"`). */
  icon?: string;
}

export interface ViewManifest {
  id: string;
  name: string;
  type: "webview";
  /** Relative path within the bundle to the webview's HTML document. */
  page?: string;
}

export interface CommandManifest {
  command: string;
  title: string;
}

export interface MenuItemManifest {
  /** Id of a contributed `command` to run when the item is selected. */
  command: string;
  /** Optional ordering group within the slot (lower groups sort first). */
  group?: string;
  /**
   * Optional visibility clause evaluated against the host UI-context (see
   * `when.ts`), e.g. `"backend == cloud"` or `"emailVerified && repoConnected"`.
   * Hiding an item runs no extension code — it reads host facts only.
   */
  when?: string;
}

export interface ContributesManifest {
  viewsContainers?: { activitybar?: ActivityBarContainerManifest[] };
  /** Map of container id → views contributed into it. */
  views?: Record<string, ViewManifest[]>;
  commands?: CommandManifest[];
  /** Map of menu-slot id (e.g. `"conversationTabs/context"`) → items. */
  menus?: Record<string, MenuItemManifest[]>;
}

export interface ExtensionManifest {
  /** Unique id, conventionally `publisher.name` (e.g. `"acme.compliance"`). */
  id: string;
  name: string;
  version: string;
  publisher?: string;
  /** Host compatibility range, semver (e.g. `"^1.0.0"`). */
  engines: { agentCanvas: string };
  /** Entry worker module path within the bundle (omit for webview-only extensions). */
  main?: string;
  activationEvents?: ActivationEvent[];
  capabilities?: Capability[];
  contributes?: ContributesManifest;
}

export type ManifestParseResult =
  | { ok: true; manifest: ExtensionManifest }
  | { ok: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i;
const ACTIVATION_PATTERN = /^(\*|onStartup|onCommand:.+|onView:.+)$/;

class Validator {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  requireString(value: unknown, path: string): string | undefined {
    if (typeof value !== "string" || value.length === 0) {
      this.fail(path, "expected a non-empty string");
      return undefined;
    }
    return value;
  }
}

function validateContributes(
  raw: unknown,
  v: Validator,
): ContributesManifest | undefined {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) {
    v.fail("contributes", "expected an object");
    return undefined;
  }

  const contributes: ContributesManifest = {};

  if (raw.viewsContainers !== undefined) {
    if (!isObject(raw.viewsContainers)) {
      v.fail("contributes.viewsContainers", "expected an object");
    } else if (raw.viewsContainers.activitybar !== undefined) {
      const list = raw.viewsContainers.activitybar;
      if (!Array.isArray(list)) {
        v.fail("contributes.viewsContainers.activitybar", "expected an array");
      } else {
        contributes.viewsContainers = {
          activitybar: list.map((entry, i) => {
            const path = `contributes.viewsContainers.activitybar[${i}]`;
            const obj = isObject(entry) ? entry : {};
            if (!isObject(entry)) v.fail(path, "expected an object");
            return {
              id: v.requireString(obj.id, `${path}.id`) ?? "",
              title: v.requireString(obj.title, `${path}.title`) ?? "",
              icon:
                obj.icon === undefined
                  ? undefined
                  : v.requireString(obj.icon, `${path}.icon`),
            };
          }),
        };
      }
    }
  }

  if (raw.views !== undefined) {
    if (!isObject(raw.views)) {
      v.fail("contributes.views", "expected an object");
    } else {
      const views: Record<string, ViewManifest[]> = {};
      for (const [containerId, list] of Object.entries(raw.views)) {
        const path = `contributes.views.${containerId}`;
        if (!Array.isArray(list)) {
          v.fail(path, "expected an array");
          continue;
        }
        views[containerId] = list.map((entry, i) => {
          const itemPath = `${path}[${i}]`;
          const obj = isObject(entry) ? entry : {};
          if (!isObject(entry)) v.fail(itemPath, "expected an object");
          if (obj.type !== "webview") {
            v.fail(`${itemPath}.type`, 'expected "webview"');
          }
          return {
            id: v.requireString(obj.id, `${itemPath}.id`) ?? "",
            name: v.requireString(obj.name, `${itemPath}.name`) ?? "",
            type: "webview",
            page:
              obj.page === undefined
                ? undefined
                : v.requireString(obj.page, `${itemPath}.page`),
          };
        });
      }
      contributes.views = views;
    }
  }

  if (raw.commands !== undefined) {
    if (!Array.isArray(raw.commands)) {
      v.fail("contributes.commands", "expected an array");
    } else {
      contributes.commands = raw.commands.map((entry, i) => {
        const path = `contributes.commands[${i}]`;
        const obj = isObject(entry) ? entry : {};
        if (!isObject(entry)) v.fail(path, "expected an object");
        return {
          command: v.requireString(obj.command, `${path}.command`) ?? "",
          title: v.requireString(obj.title, `${path}.title`) ?? "",
        };
      });
    }
  }

  if (raw.menus !== undefined) {
    if (!isObject(raw.menus)) {
      v.fail("contributes.menus", "expected an object");
    } else {
      const menus: Record<string, MenuItemManifest[]> = {};
      for (const [slotId, list] of Object.entries(raw.menus)) {
        const path = `contributes.menus.${slotId}`;
        if (!Array.isArray(list)) {
          v.fail(path, "expected an array");
          continue;
        }
        menus[slotId] = list.map((entry, i) => {
          const itemPath = `${path}[${i}]`;
          const obj = isObject(entry) ? entry : {};
          if (!isObject(entry)) v.fail(itemPath, "expected an object");
          return {
            command: v.requireString(obj.command, `${itemPath}.command`) ?? "",
            group:
              obj.group === undefined
                ? undefined
                : v.requireString(obj.group, `${itemPath}.group`),
            when:
              obj.when === undefined
                ? undefined
                : v.requireString(obj.when, `${itemPath}.when`),
          };
        });
      }
      contributes.menus = menus;
    }
  }

  return contributes;
}

/**
 * Parse and validate an `extension.json` payload (already JSON-decoded). Never
 * throws — returns a discriminated result so callers handle malformed bundles
 * explicitly.
 */
export function parseManifest(input: unknown): ManifestParseResult {
  const v = new Validator();

  if (!isObject(input)) {
    return { ok: false, errors: ["manifest: expected a JSON object"] };
  }

  const id = v.requireString(input.id, "id");
  if (id !== undefined && !ID_PATTERN.test(id)) {
    v.fail("id", 'expected "publisher.name" format');
  }
  const name = v.requireString(input.name, "name");
  const version = v.requireString(input.version, "version");

  let engines: { agentCanvas: string } | undefined;
  if (!isObject(input.engines)) {
    v.fail("engines", "expected an object with an agentCanvas range");
  } else {
    const range = v.requireString(
      input.engines.agentCanvas,
      "engines.agentCanvas",
    );
    if (range !== undefined) engines = { agentCanvas: range };
  }

  let main: string | undefined;
  if (input.main !== undefined) {
    main = v.requireString(input.main, "main");
  }

  let activationEvents: ActivationEvent[] | undefined;
  if (input.activationEvents !== undefined) {
    if (!Array.isArray(input.activationEvents)) {
      v.fail("activationEvents", "expected an array");
    } else {
      activationEvents = input.activationEvents.map((evt, i) => {
        if (typeof evt !== "string" || !ACTIVATION_PATTERN.test(evt)) {
          v.fail(`activationEvents[${i}]`, "unknown activation event");
        }
        return evt as ActivationEvent;
      });
    }
  }

  let capabilities: Capability[] | undefined;
  if (input.capabilities !== undefined) {
    if (!Array.isArray(input.capabilities)) {
      v.fail("capabilities", "expected an array");
    } else {
      capabilities = input.capabilities.map((cap, i) => {
        if (!KNOWN_CAPABILITIES.includes(cap as Capability)) {
          v.fail(
            `capabilities[${i}]`,
            `unknown capability "${String(cap)}"; allowed: ${KNOWN_CAPABILITIES.join(", ")}`,
          );
        }
        return cap as Capability;
      });
    }
  }

  const contributes = validateContributes(input.contributes, v);

  if (v.errors.length > 0) {
    return { ok: false, errors: v.errors };
  }

  return {
    ok: true,
    manifest: {
      id: id as string,
      name: name as string,
      version: version as string,
      publisher:
        typeof input.publisher === "string" ? input.publisher : undefined,
      engines: engines as { agentCanvas: string },
      main,
      activationEvents,
      capabilities,
      contributes,
    },
  };
}
