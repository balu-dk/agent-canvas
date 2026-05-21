import React from "react";
import {
  ConversationErrorEvent,
  ServerErrorEvent,
} from "#/types/agent-server/core";
import {
  isConversationErrorEvent,
  isServerErrorEvent,
} from "#/types/agent-server/type-guards";
import CircleErrorIcon from "#/icons/circle-error.svg?react";
import { ErrorMessage } from "../../../features/chat/error-message";

interface ConversationErrorEventMessageProps {
  event: ConversationErrorEvent | ServerErrorEvent;
}

// Renders a ConversationErrorEvent / ServerErrorEvent inline (e.g. an LLM
// AuthenticationError) so a failed run is visible instead of only logged.
export function ConversationErrorEventMessage({
  event,
}: ConversationErrorEventMessageProps) {
  if (!isConversationErrorEvent(event) && !isServerErrorEvent(event)) {
    return null;
  }

  return (
    <ErrorMessage
      errorId={event.code}
      defaultMessage={event.detail}
      icon={
        <CircleErrorIcon
          className="inline-block w-4 h-4 mr-1.5 align-text-bottom"
          aria-hidden
          data-testid="conversation-error-icon"
        />
      }
    />
  );
}
