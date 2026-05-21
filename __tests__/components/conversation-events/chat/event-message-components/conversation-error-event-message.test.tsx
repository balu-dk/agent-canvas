import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { renderWithProviders } from "test-utils";
import { ConversationErrorEventMessage } from "#/components/conversation-events/chat/event-message-components/conversation-error-event-message";
import {
  ConversationErrorEvent,
  ServerErrorEvent,
} from "#/types/agent-server/core";

const makeConversationError = (
  overrides: Partial<ConversationErrorEvent> = {},
): ConversationErrorEvent => ({
  id: "err-1",
  kind: "ConversationErrorEvent",
  timestamp: "2024-01-01T00:00:00Z",
  source: "environment",
  code: "AuthenticationError",
  detail: "litellm.AuthenticationError: LiteLLM Virtual Key expected.",
  ...overrides,
});

describe("ConversationErrorEventMessage", () => {
  it("shows an error icon and reveals the detail when expanded", async () => {
    const event = makeConversationError();
    renderWithProviders(<ConversationErrorEventMessage event={event} />);

    expect(screen.getByTestId("conversation-error-icon")).toBeInTheDocument();
    // Detail is collapsed by default; expand it to surface the actionable text.
    expect(screen.queryByText(event.detail)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText(event.detail)).toBeInTheDocument();
  });

  it("renders ServerErrorEvent detail too", async () => {
    const event: ServerErrorEvent = {
      ...makeConversationError(),
      kind: "ServerErrorEvent",
      code: "MCPError",
      detail: "Something went wrong on the server.",
    };
    renderWithProviders(<ConversationErrorEventMessage event={event} />);

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText(event.detail)).toBeInTheDocument();
  });

  it("renders nothing for a non-error event", () => {
    const { container } = renderWithProviders(
      <ConversationErrorEventMessage
        event={{ kind: "MessageEvent" } as never}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
