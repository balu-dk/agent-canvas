import { SkillsClient } from "@openhands/typescript-client/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import SkillsService from "#/api/skills-service";

const { mockGetSkills } = vi.hoisted(() => ({
  mockGetSkills: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  SkillsClient: vi.fn(function SkillsClientMock() {
    return { getSkills: mockGetSkills };
  }),
}));

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8000",
  apiKey: "",
  kind: "local",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
  mockGetSkills.mockReset();
  vi.mocked(SkillsClient).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetActiveStoreForTests();
});

describe("SkillsService.getSkills against the agent-server backend", () => {
  it("scopes public skill loading to the curated default marketplace manifest", async () => {
    mockGetSkills.mockResolvedValue({
      skills: [
        {
          name: "github",
          type: "knowledge",
          content: "...",
          triggers: [],
          source: "public",
          is_agentskills_format: false,
        },
      ],
      sources: { sandbox: 0, sdk_base: 1, org: 0, project: 0 },
    });

    const skills = await SkillsService.getSkills();

    // load_public:true is always set alongside marketplace_path to scope
    // loading to only the curated defaults — never the full 44+ cache.
    expect(mockGetSkills).toHaveBeenCalledTimes(1);
    expect(mockGetSkills.mock.calls[0]?.[0]).toMatchObject({
      load_public: true,
      load_user: true,
      load_project: true,
      load_org: false,
      marketplace_path: `${window.location.origin}/default-skills-marketplace.json`,
    });
    expect(skills.map((s) => s.name)).toEqual(["github"]);
  });
});
