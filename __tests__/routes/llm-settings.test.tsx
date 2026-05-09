import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LlmSettingsScreen from "#/routes/llm-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings_schema:
      overrides.agent_settings_schema ??
      MOCK_DEFAULT_USER_SETTINGS.agent_settings_schema,
    agent_settings:
      overrides.agent_settings ?? MOCK_DEFAULT_USER_SETTINGS.agent_settings,
  };
}

function renderLlmSettingsScreen() {
  return render(<LlmSettingsScreen />, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })}
        >
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

describe("LlmSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the profiles list view by default", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ profiles: [], active_profile: null });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // The profiles list view should be shown by default
    expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument();
    // Settings form should NOT be visible by default
    expect(screen.queryByTestId("llm-provider-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("llm-api-key-input")).not.toBeInTheDocument();
  });

  it("shows the settings form when Add LLM Profile is clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ profiles: [], active_profile: null });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Now the settings form should be visible
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });
  });

  it("shows profiles in the list view", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({
      profiles: [
        { name: "my_profile", model: "openai/gpt-4o", base_url: null, api_key_set: true },
        { name: "other_profile", model: "anthropic/claude-3", base_url: null, api_key_set: true },
      ],
      active_profile: "my_profile",
    });

    renderLlmSettingsScreen();

    // Wait for screen and profiles to load
    await screen.findByTestId("llm-settings-screen");
    
    // Verify profiles are rendered
    await waitFor(() => {
      const rows = screen.getAllByTestId("profile-list-row");
      expect(rows).toHaveLength(2);
    });

    // Verify profile names and models are displayed
    expect(screen.getByText("my_profile")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("other_profile")).toBeInTheDocument();
    expect(screen.getByText("anthropic/claude-3")).toBeInTheDocument();
  });

  it("shows empty profile name when adding a new profile", async () => {
    const user = userEvent.setup();
    
    // Settings have existing LLM configuration
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "https://api.openai.com/v1",
          },
        },
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [], 
      active_profile: null 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // The profile name input should be empty (not pre-filled)
    const profileNameInput = screen.getByTestId("llm-profile-name-input");
    expect(profileNameInput).toHaveValue("");

    // API key should also be empty (form starts blank)
    const apiKeyInput = screen.getByTestId("llm-api-key-input");
    expect(apiKeyInput).toHaveValue("");
  });

  it("shows populated profile name when editing an existing profile", async () => {
    const user = userEvent.setup();
    
    // Settings have existing LLM configuration
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "https://api.openai.com/v1",
          },
        },
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [
        { name: "my_profile", model: "openai/gpt-4o", base_url: null, api_key_set: true },
      ], 
      active_profile: "my_profile" 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Wait for profiles to load
    await waitFor(() => {
      expect(screen.getByTestId("profile-list-row")).toBeInTheDocument();
    });

    // Click the menu button on the profile row
    const profileRow = screen.getByTestId("profile-list-row");
    const menuButton = within(profileRow).getByTestId("profile-menu-trigger");
    await user.click(menuButton);

    // Click Edit in the menu
    const editButton = await screen.findByTestId("profile-action-edit");
    await user.click(editButton);

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // The profile name input should have the profile name
    const profileNameInput = screen.getByTestId("llm-profile-name-input");
    expect(profileNameInput).toHaveValue("my_profile");
  });

  it("returns to profiles list when cancel is clicked", async () => {
    const user = userEvent.setup();
    
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [], 
      active_profile: null 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // Click Cancel
    await user.click(screen.getByTestId("cancel-profile-edit"));

    // Should be back to profiles list
    await waitFor(() => {
      expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument();
      expect(screen.queryByTestId("llm-profile-form")).not.toBeInTheDocument();
    });
  });
});