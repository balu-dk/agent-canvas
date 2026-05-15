import { http, HttpResponse } from "msw";
import type {
  InstalledSkillSummary,
  InstalledSkillsResponse,
  MarketplaceResponse,
  ToggleSkillResponse,
} from "@openhands/typescript-client";

// Mutable store so tests can inspect and mutate installed skills state.
const installedSkills = new Map<string, InstalledSkillSummary>([
  ["github", { name: "github", version: "1.0.0", enabled: true }],
]);

export function resetInstalledSkillsMockData() {
  installedSkills.clear();
  installedSkills.set("github", {
    name: "github",
    version: "1.0.0",
    enabled: true,
  });
}

export const SKILLS_HANDLERS = [
  // List installed skills
  http.get("*/api/skills/installed", () => {
    const response: InstalledSkillsResponse = {
      skills: Array.from(installedSkills.values()).map((s) => ({
        name: s.name,
        version: s.version ?? null,
        enabled: s.enabled,
      })),
    };
    return HttpResponse.json(response);
  }),

  // Install a skill (returns InstalledSkillInfo per the API spec)
  http.post("*/api/skills/install", async ({ request }) => {
    const body = (await request.json()) as { source?: string };
    const name = body.source?.split("/").at(-1) ?? "unknown";
    installedSkills.set(name, { name, version: "1.0.0", enabled: true });
    // The server returns InstalledSkillInfo; we embed the summary fields here
    return HttpResponse.json(
      {
        name,
        version: "1.0.0",
        description: null,
        enabled: true,
        source: body.source ?? null,
        installed_at: new Date().toISOString(),
        install_path: null,
      },
      { status: 201 },
    );
  }),

  // Get a specific installed skill (returns InstalledSkillInfo)
  http.get("*/api/skills/installed/:name", ({ params }) => {
    const name = params.name as string;
    const skill = installedSkills.get(name);
    if (!skill) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    // Return full InstalledSkillInfo shape
    return HttpResponse.json({
      ...skill,
      description: null,
      source: null,
      installed_at: null,
      install_path: null,
    });
  }),

  // Toggle a skill
  http.patch(
    "*/api/skills/installed/:name/toggle",
    async ({ params, request }) => {
      const name = params.name as string;
      const body = (await request.json()) as { enabled?: boolean };
      const skill = installedSkills.get(name);
      if (!skill) {
        return HttpResponse.json({ detail: "Not found" }, { status: 404 });
      }
      skill.enabled = body.enabled ?? !skill.enabled;
      const response: ToggleSkillResponse = { name, enabled: skill.enabled };
      return HttpResponse.json(response);
    },
  ),

  // Uninstall a skill
  http.delete("*/api/skills/installed/:name", ({ params }) => {
    const name = params.name as string;
    installedSkills.delete(name);
    return new HttpResponse(null, { status: 204 });
  }),

  // Marketplace
  http.get("*/api/skills/marketplace", () => {
    const response: MarketplaceResponse = {
      skills: [
        {
          name: "github",
          description: "Interact with GitHub repositories and pull requests.",
          source:
            "https://github.com/OpenHands/extensions/tree/main/skills/github",
          installed: installedSkills.has("github"),
        },
        {
          name: "docker",
          description: "Run Docker commands within a container environment.",
          source:
            "https://github.com/OpenHands/extensions/tree/main/skills/docker",
          installed: installedSkills.has("docker"),
        },
        {
          name: "code-review",
          description:
            "Rigorous code review focusing on data structures and simplicity.",
          source:
            "https://github.com/OpenHands/extensions/tree/main/skills/codereview",
          installed: installedSkills.has("code-review"),
        },
      ],
    };
    return HttpResponse.json(response);
  }),
];
