import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatInputModelMenuContent,
  type ChatInputModelMenuContentProps,
} from "./chat-input-model";
import type { ChatInputModelState } from "#/hooks/use-chat-input-model-state";

const addCustomModel = vi.fn();
const removeCustomModel = vi.fn();
const recordLastModel = vi.fn();
const setPendingModel = vi.fn();
const mutate = vi.fn();

vi.mock("#/stores/acp-model-memory-store", () => ({
  useAcpModelMemoryStore: (selector: (s: unknown) => unknown) =>
    selector({ addCustomModel, removeCustomModel, recordLastModel }),
}));
vi.mock("#/stores/agent-profile-selection-store", () => ({
  useAgentProfileSelectionStore: (selector: (s: unknown) => unknown) =>
    selector({ setPendingModel }),
}));
vi.mock("#/hooks/mutation/use-switch-acp-model", () => ({
  useSwitchAcpModel: () => ({ mutate }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseModel: ChatInputModelState = {
  isAcpContext: true,
  displayModel: "Claude Opus",
  currentModelId: "claude-opus",
  availableAcpModels: [{ id: "claude-opus", label: "Claude Opus" }],
  showAcpPicker: true,
  switchConversationId: null,
  isPendingProfileMode: true,
  acpEngine: "claude-code",
  backendId: "b1",
  destinationPath: "/settings/agent",
  destinationLabel: "Agent",
};

function renderContent(overrides: Partial<ChatInputModelState> = {}) {
  const onClose = vi.fn();
  const props: ChatInputModelMenuContentProps = {
    model: { ...baseModel, ...overrides },
    onClose,
  };
  render(
    <MemoryRouter>
      <ul>
        <ChatInputModelMenuContent {...props} />
      </ul>
    </MemoryRouter>,
  );
  return { onClose };
}

describe("ChatInputModelMenuContent custom model", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always renders the custom-model input (no click-to-reveal toggle)", () => {
    renderContent();
    expect(
      screen.getByTestId("chat-input-acp-model-custom-input"),
    ).toBeInTheDocument();
  });

  it("adds, persists and selects a typed custom model, then closes", () => {
    const { onClose } = renderContent();
    fireEvent.change(screen.getByTestId("chat-input-acp-model-custom-input"), {
      target: { value: "claude-fable-5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "BUTTON$ADD" }));

    expect(addCustomModel).toHaveBeenCalledWith(
      "b1",
      "claude-code",
      "claude-fable-5",
    );
    expect(setPendingModel).toHaveBeenCalledWith("claude-fable-5");
    expect(recordLastModel).toHaveBeenCalledWith(
      "b1",
      "claude-code",
      "claude-fable-5",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render the custom input outside an ACP context", () => {
    renderContent({ acpEngine: null });
    expect(
      screen.queryByTestId("chat-input-acp-model-custom-input"),
    ).not.toBeInTheDocument();
  });
});
