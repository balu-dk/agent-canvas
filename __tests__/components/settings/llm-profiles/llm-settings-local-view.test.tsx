import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { LlmSettingsLocalView } from "#/components/features/settings/llm-profiles/llm-settings-local-view";
import * as profilesService from "#/api/profiles-service/profiles-service.api";
import * as useLlmProfilesHook from "#/hooks/query/use-llm-profiles";
import * as useActivateLlmProfileHook from "#/hooks/mutation/use-activate-llm-profile";
import * as useSaveLlmProfileHook from "#/hooks/mutation/use-save-llm-profile";

vi.mock("#/api/profiles-service/profiles-service.api");
vi.mock("#/hooks/query/use-llm-profiles");
vi.mock("#/hooks/mutation/use-activate-llm-profile");
vi.mock("#/hooks/mutation/use-save-llm-profile");

const mockProfiles = [
  {
    name: "gpt-4-profile",
    model: "openai/gpt-4",
    base_url: null,
    api_key_set: true,
  },
  {
    name: "claude-profile",
    model: "anthropic/claude-3-opus",
    base_url: null,
    api_key_set: true,
  },
];

describe("LlmSettingsLocalView", () => {
  const mockActivateMutateAsync = vi.fn();
  const mockSaveMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useLlmProfilesHook.useLlmProfiles).mockReturnValue({
      data: { profiles: mockProfiles, active_profile: "gpt-4-profile" },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useLlmProfilesHook.useLlmProfiles>);

    vi.mocked(useActivateLlmProfileHook.useActivateLlmProfile).mockReturnValue({
      mutateAsync: mockActivateMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useActivateLlmProfileHook.useActivateLlmProfile>);

    vi.mocked(useSaveLlmProfileHook.useSaveLlmProfile).mockReturnValue({
      mutateAsync: mockSaveMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useSaveLlmProfileHook.useSaveLlmProfile>);
  });

  it("renders profile list by default", () => {
    renderWithProviders(<LlmSettingsLocalView />);

    // Check for profile names (translation keys won't be resolved in test)
    expect(screen.getByText("gpt-4-profile")).toBeInTheDocument();
    expect(screen.getByText("claude-profile")).toBeInTheDocument();
  });

  it("shows Add LLM Profile button", () => {
    renderWithProviders(<LlmSettingsLocalView />);

    expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument();
  });

  it("switches to create view when Add button clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LlmSettingsLocalView />);

    const addButton = screen.getByTestId("add-llm-profile");
    await user.click(addButton);

    // Should show create view elements (profile name input and back button)
    expect(screen.getByTestId("profile-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("back-to-profiles")).toBeInTheDocument();
  });

  it("returns to list view when back button clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LlmSettingsLocalView />);

    // Go to create view
    await user.click(screen.getByTestId("add-llm-profile"));
    expect(screen.getByTestId("profile-name-input")).toBeInTheDocument();

    // Click back
    await user.click(screen.getByTestId("back-to-profiles"));

    // Should be back at list - check for profile names
    expect(screen.getByText("gpt-4-profile")).toBeInTheDocument();
  });

  it("returns to list view when cancel button clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LlmSettingsLocalView />);

    // Go to create view
    await user.click(screen.getByTestId("add-llm-profile"));

    // Click cancel
    await user.click(screen.getByTestId("cancel-profile-btn"));

    // Should be back at list
    expect(screen.getByText("gpt-4-profile")).toBeInTheDocument();
  });

  it("shows loading state when profiles are loading", () => {
    vi.mocked(useLlmProfilesHook.useLlmProfiles).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useLlmProfilesHook.useLlmProfiles>);

    renderWithProviders(<LlmSettingsLocalView />);

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("shows error message when profiles fail to load", () => {
    vi.mocked(useLlmProfilesHook.useLlmProfiles).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
    } as ReturnType<typeof useLlmProfilesHook.useLlmProfiles>);

    renderWithProviders(<LlmSettingsLocalView />);

    // Error message component should be rendered (text is a translation key)
    expect(screen.getByText("SETTINGS$PROFILES_LOAD_ERROR")).toBeInTheDocument();
  });
});
