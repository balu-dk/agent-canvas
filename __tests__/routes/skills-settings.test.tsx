import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstalledSkillSummary } from "@openhands/typescript-client";
import SkillsSettingsScreen from "#/routes/skills-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import SkillsService from "#/api/skills-service";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings, SkillInfo } from "#/types/settings";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
  };
}

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "deno",
    type: "knowledge",
    source:
      "/Users/test/.openhands/cache/skills/public-skills/skills/deno/SKILL.md",
    description:
      "If the project uses deno, use this skill to initialize Deno projects.",
    triggers: ["deno", "deno.json", "deno.lock"],
    version: "1.0.0",
    license: "Apache-2.0",
    compatibility: "Requires Deno 1.40+",
    metadata: null,
    allowed_tools: ["bash"],
    is_agentskills_format: true,
    disable_model_invocation: false,
    ...overrides,
  };
}

function renderSkillsSettingsScreen() {
  return render(<SkillsSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });
}

describe("SkillsSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());
    // Installed skills are empty by default so the installed section is hidden
    vi.spyOn(SkillsService, "listInstalledSkills").mockResolvedValue([]);
  });

  it("renders the description text inside the description badge", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    const description = await screen.findByTestId(
      "skills-settings-description",
    );
    expect(description).toHaveTextContent("SETTINGS$SKILLS_PAGE_DESCRIPTION");
    expect(screen.getByText("NAV$EXTENSIONS")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-extensions-/skills")).toHaveTextContent(
      "Skills",
    );
    expect(screen.getByTestId("sidebar-extensions-/plugins")).toHaveTextContent(
      "Plugins",
    );
    expect(screen.getByTestId("sidebar-extensions-/mcp")).toHaveTextContent(
      "MCP Servers",
    );
  });

  it("surfaces the YAML description and a friendly type label instead of the raw source path", async () => {
    // Arrange: a skill whose source is a long local filesystem path and whose
    // type is the internal "knowledge" identifier.
    const skill = buildSkill();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    // Act
    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    // Assert: description is the primary subtitle, the type is rendered as
    // its friendly label key, and the raw filesystem path is hidden until
    // the user opens the Details disclosure.
    expect(
      within(card).getByTestId(`skill-description-${skill.name}`),
    ).toHaveTextContent(skill.description!);
    expect(
      within(card).getByTestId("skill-type-badge-knowledge"),
    ).toHaveTextContent("SETTINGS$SKILLS_TYPE_KNOWLEDGE");
    expect(
      within(card).queryByTestId(`skill-source-${skill.name}`),
    ).not.toBeInTheDocument();
  });

  it("filters skills by name, description, or trigger via the search input", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", description: "Deno runtime helper" }),
      buildSkill({
        name: "vercel",
        description: "Preview deployment helper",
        triggers: ["vercel", "preview deployment"],
        source: "/skills/vercel/SKILL.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "preview" },
    });

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-vercel")).toBeInTheDocument();
  });

  it("narrows the visible skills when a type filter chip is selected", async () => {
    const user = userEvent.setup();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", type: "knowledge" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    await user.click(screen.getByTestId("skills-type-filter-repo"));

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-global-rules")).toBeInTheDocument();
  });

  it("reveals license, compatibility, allowed tools, and source path when Details is expanded", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({
      name: "rich",
      license: "MIT",
      compatibility: "Requires Python 3.11+",
      allowed_tools: ["bash", "execute_bash"],
      source: "/skills/rich/SKILL.md",
    });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(
      within(card).getByTestId(`skill-details-toggle-${skill.name}`),
    );

    const details = within(card).getByTestId(`skill-details-${skill.name}`);
    expect(details).toHaveTextContent("MIT");
    expect(details).toHaveTextContent("Requires Python 3.11+");
    expect(details).toHaveTextContent("execute_bash");
    expect(
      within(card).getByTestId(`skill-source-${skill.name}`),
    ).toHaveTextContent(skill.source!);
  });

  it("shows an empty-state message when no skills match the current filters", async () => {
    const skill = buildSkill();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "no-such-skill-xyz" },
    });

    expect(screen.getByTestId("skills-no-match")).toBeInTheDocument();
  });

  // ── default_skills section ─────────────────────────────────────────────────

  it("renders the Default Skills section", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    const section = await screen.findByTestId("default-skills-section");
    expect(section).toBeInTheDocument();
  });

  it("renders Reset to recommended button", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    expect(
      await screen.findByTestId("reset-to-recommended-button"),
    ).toBeInTheDocument();
  });

  it("shows chips for each available skill", async () => {
    const skills = [
      buildSkill({ name: "github" }),
      buildSkill({ name: "docker" }),
    ];
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue(skills);

    renderSkillsSettingsScreen();

    await screen.findByTestId("default-skill-chip-github");
    expect(screen.getByTestId("default-skill-chip-docker")).toBeInTheDocument();
  });

  it("marks curated defaults as pressed chips", async () => {
    const { CURATED_DEFAULT_SKILLS } = await import("#/services/settings");
    const skills = CURATED_DEFAULT_SKILLS.map((name) => buildSkill({ name }));
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue(skills);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ default_skills: [...CURATED_DEFAULT_SKILLS] }),
    );

    renderSkillsSettingsScreen();

    for (const name of CURATED_DEFAULT_SKILLS) {
      const chip = await screen.findByTestId(`default-skill-chip-${name}`);
      expect(chip).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("chip click toggles default state off then on", async () => {
    const user = userEvent.setup();
    const { CURATED_DEFAULT_SKILLS } = await import("#/services/settings");
    const githubSkill = buildSkill({ name: "github" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([githubSkill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ default_skills: ["github"] }),
    );

    renderSkillsSettingsScreen();

    const chip = await screen.findByTestId("default-skill-chip-github");
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await user.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");

    // Suppress unused import warning
    void CURATED_DEFAULT_SKILLS;
  });

  it("clicking Reset sets default chips back to curated list", async () => {
    const user = userEvent.setup();
    const { CURATED_DEFAULT_SKILLS } = await import("#/services/settings");
    const skills = [
      buildSkill({ name: "github" }),
      buildSkill({ name: "linear" }),
    ];
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue(skills);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ default_skills: ["linear"] }),
    );

    renderSkillsSettingsScreen();

    // Initially only linear is default
    const linearChip = await screen.findByTestId("default-skill-chip-linear");
    expect(linearChip).toHaveAttribute("aria-pressed", "true");
    const githubChip = screen.getByTestId("default-skill-chip-github");
    expect(githubChip).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByTestId("reset-to-recommended-button"));

    // After reset, github (a curated default) should be pressed
    if (CURATED_DEFAULT_SKILLS.includes("github")) {
      expect(screen.getByTestId("default-skill-chip-github")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("skill card shows DEFAULT badge when skill is in default set", async () => {
    const skill = buildSkill({ name: "github" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ default_skills: ["github"] }),
    );

    renderSkillsSettingsScreen();

    await screen.findByTestId("skill-card-github");
    expect(
      screen.getByTestId("skill-default-badge-github"),
    ).toBeInTheDocument();
  });

  it("skill card does NOT show DEFAULT badge when skill is not in default set", async () => {
    const skill = buildSkill({ name: "linear" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ default_skills: [] }),
    );

    renderSkillsSettingsScreen();

    await screen.findByTestId("skill-card-linear");
    expect(
      screen.queryByTestId("skill-default-badge-linear"),
    ).not.toBeInTheDocument();
  });

  // ── installed skills section ───────────────────────────────────────────────

  it("installed skills section is hidden when there are no installed skills", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    await screen.findByTestId("default-skills-section");
    expect(
      screen.queryByTestId("installed-skills-section"),
    ).not.toBeInTheDocument();
  });

  it("installed skills section appears when there are installed skills", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
    vi.spyOn(SkillsService, "listInstalledSkills").mockResolvedValue([
      {
        name: "github",
        version: "1.0.0",
        enabled: true,
      } satisfies InstalledSkillSummary,
    ]);

    renderSkillsSettingsScreen();

    expect(
      await screen.findByTestId("installed-skill-row-github"),
    ).toBeInTheDocument();
  });

  it("skill card shows INSTALLED badge for installed skills", async () => {
    const skill = buildSkill({ name: "github" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    vi.spyOn(SkillsService, "listInstalledSkills").mockResolvedValue([
      {
        name: "github",
        version: "1.0.0",
        enabled: true,
      } satisfies InstalledSkillSummary,
    ]);

    renderSkillsSettingsScreen();

    await screen.findByTestId("skill-card-github");
    expect(
      screen.getByTestId("skill-installed-badge-github"),
    ).toBeInTheDocument();
  });

  // ── marketplace section ────────────────────────────────────────────────────

  it("renders the marketplace install input and button", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    await screen.findByTestId("install-skill-section");
    expect(screen.getByTestId("marketplace-source-input")).toBeInTheDocument();
    expect(screen.getByTestId("install-skill-button")).toBeInTheDocument();
  });

  it("install button is disabled when source input is empty", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    expect(await screen.findByTestId("install-skill-button")).toBeDisabled();
  });

  it("install button is enabled when source input has text", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    fireEvent.change(await screen.findByTestId("marketplace-source-input"), {
      target: { value: "https://github.com/example/skill" },
    });

    expect(screen.getByTestId("install-skill-button")).not.toBeDisabled();
  });
});
