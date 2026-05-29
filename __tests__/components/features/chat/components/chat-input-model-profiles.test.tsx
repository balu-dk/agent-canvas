import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";
import type { ChatInputModelState } from "#/hooks/use-chat-input-model-state";
import type { ProfileWithPlan } from "#/hooks/use-profile-runtime-plans";

const useProfileRuntimePlansMock = vi.fn();
const switchAcpModelMutate = vi.fn();
const switchAndLog = vi.fn();

vi.mock("#/hooks/use-profile-runtime-plans", () => ({
  useProfileRuntimePlans: () => useProfileRuntimePlansMock(),
}));

vi.mock("#/hooks/mutation/use-switch-acp-model", () => ({
  useSwitchAcpModel: () => ({ mutate: switchAcpModelMutate }),
}));

vi.mock("#/hooks/mutation/use-switch-llm-profile-and-log", () => ({
  useSwitchLlmProfileAndLog: () => ({ switchAndLog, isPending: false }),
}));

import { ChatInputModelMenuContent } from "#/components/features/chat/components/chat-input-model";

const acpModelState: ChatInputModelState = {
  isAcpContext: true,
  displayModel: "Claude Opus 4.7",
  currentModelId: "claude-opus-4-7",
  availableAcpModels: [{ id: "claude-opus-4-7", label: "Claude Opus 4.7" }],
  showAcpPicker: true,
  switchConversationId: "conv-1",
  destinationPath: "/settings/agent",
  destinationLabel: "Agent",
};

const disabledProfile: ProfileWithPlan = {
  profile: {
    name: "Cheap GPT daily driver",
    model: "openai/gpt-4o",
    base_url: null,
    api_key_set: true,
  },
  plan: { action: "disabled", reason: "different-agent-kind" },
};

describe("ChatInputModelMenuContent disabled-profile section", () => {
  beforeEach(() => {
    useProfileRuntimePlansMock.mockReset();
    switchAcpModelMutate.mockReset();
    switchAndLog.mockReset();
  });

  it("shows incompatible profiles visible-but-disabled with a reason in an ACP conversation", () => {
    useProfileRuntimePlansMock.mockReturnValue({
      profiles: [disabledProfile],
      activeProfileName: null,
      isAcpContext: true,
    });

    renderWithProviders(
      <ChatInputModelMenuContent model={acpModelState} onClose={() => {}} />,
    );

    const row = screen.getByTestId(
      "chat-input-profile-option-Cheap GPT daily driver",
    );
    expect(row).toBeDisabled();
    expect(row).toHaveTextContent("Cheap GPT daily driver");
    // The reason is surfaced inline (not silently swallowed).
    expect(
      screen.getByTestId(
        "chat-input-profile-reason-Cheap GPT daily driver",
      ),
    ).toBeInTheDocument();
  });

  it("clicking a disabled profile never triggers a model switch", () => {
    useProfileRuntimePlansMock.mockReturnValue({
      profiles: [disabledProfile],
      activeProfileName: null,
      isAcpContext: true,
    });

    renderWithProviders(
      <ChatInputModelMenuContent model={acpModelState} onClose={() => {}} />,
    );

    // disabled <button> swallows the click; assert no switch was attempted.
    screen
      .getByTestId("chat-input-profile-option-Cheap GPT daily driver")
      .click();
    expect(switchAcpModelMutate).not.toHaveBeenCalled();
  });

  it("omits the profiles section when there are no incompatible profiles", () => {
    useProfileRuntimePlansMock.mockReturnValue({
      profiles: [],
      activeProfileName: null,
      isAcpContext: true,
    });

    renderWithProviders(
      <ChatInputModelMenuContent model={acpModelState} onClose={() => {}} />,
    );

    expect(
      screen.queryByTestId(
        "chat-input-profile-option-Cheap GPT daily driver",
      ),
    ).not.toBeInTheDocument();
    // The ACP model picker is unaffected.
    expect(
      screen.getByTestId("chat-input-acp-model-option-claude-opus-4-7"),
    ).toBeInTheDocument();
  });

  it("switches the ACP model live when a switch-live ACP profile is clicked", () => {
    const switchLiveAcpProfile: ProfileWithPlan = {
      profile: {
        name: "Claude Sonnet daily",
        kind: "acp",
        model: "claude-sonnet-4-6",
        base_url: null,
        acp_server: "claude-code",
        acp_model: "claude-sonnet-4-6",
        api_key_set: true,
      },
      plan: { action: "switch-live", mutableFields: ["acp_model"] },
    };
    useProfileRuntimePlansMock.mockReturnValue({
      profiles: [switchLiveAcpProfile],
      activeProfileName: null,
      isAcpContext: true,
    });

    renderWithProviders(
      <ChatInputModelMenuContent model={acpModelState} onClose={() => {}} />,
    );

    const row = screen.getByTestId(
      "chat-input-profile-option-Claude Sonnet daily",
    );
    expect(row).not.toBeDisabled();
    row.click();
    expect(switchAcpModelMutate).toHaveBeenCalledWith({
      conversationId: "conv-1",
      model: "claude-sonnet-4-6",
    });
  });

  it("activates the whole profile (not a model swap) when selected on the home surface", () => {
    // Home / new-conversation: no active ACP conversation, so the model state
    // carries no switchConversationId. Selecting a profile must activate it
    // (kind-aware) rather than only swapping acp_model.
    const homeModelState: ChatInputModelState = {
      ...acpModelState,
      switchConversationId: null,
    };
    const selectableProfile: ProfileWithPlan = {
      profile: {
        name: "Local Codex",
        kind: "acp",
        model: "gpt-5-codex",
        base_url: null,
        acp_server: "codex",
        acp_model: "gpt-5-codex",
        api_key_set: true,
      },
      plan: { action: "switch-live", mutableFields: [] },
    };
    useProfileRuntimePlansMock.mockReturnValue({
      profiles: [selectableProfile],
      activeProfileName: null,
      isAcpContext: true,
      inConversation: false,
    });

    renderWithProviders(
      <ChatInputModelMenuContent model={homeModelState} onClose={() => {}} />,
    );

    screen.getByTestId("chat-input-profile-option-Local Codex").click();
    expect(switchAndLog).toHaveBeenCalledWith(null, "Local Codex");
    expect(switchAcpModelMutate).not.toHaveBeenCalled();
  });
});
