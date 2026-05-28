import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AcpEnvEditor } from "#/components/features/settings/acp-env-editor";

describe("AcpEnvEditor", () => {
  it("renders existing keys with a 'Set' indicator and no value field", () => {
    render(
      <AcpEnvEditor
        existingKeys={["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]}
        pendingUpdates={{}}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByTestId("agent-env-row-ANTHROPIC_API_KEY"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("agent-env-row-OPENAI_API_KEY"),
    ).toBeInTheDocument();
    // No value input rendered for existing-without-pending rows.
    expect(
      screen.queryByTestId("agent-env-value-input-ANTHROPIC_API_KEY"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty-state message when no keys exist", () => {
    render(
      <AcpEnvEditor
        existingKeys={[]}
        pendingUpdates={{}}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("agent-env-empty")).toBeInTheDocument();
  });

  it("stages a new variable via the add form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AcpEnvEditor
        existingKeys={[]}
        pendingUpdates={{}}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByTestId("agent-env-new-name"), "MY_KEY");
    await user.type(screen.getByTestId("agent-env-new-value"), "abc123");
    await user.click(screen.getByTestId("agent-env-add"));

    expect(onChange).toHaveBeenCalledWith({ MY_KEY: "abc123" });
  });

  it("rejects invalid env-var names", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AcpEnvEditor
        existingKeys={[]}
        pendingUpdates={{}}
        onChange={onChange}
      />,
    );

    // Names starting with digits are invalid (env vars must start with a letter).
    await user.type(screen.getByTestId("agent-env-new-name"), "1BAD");
    await user.click(screen.getByTestId("agent-env-add"));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("agent-env-add-error")).toHaveTextContent(
      "SETTINGS$AGENT_ENV_NAME_INVALID",
    );
  });

  it("rejects duplicates of existing or pending keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AcpEnvEditor
        existingKeys={["ANTHROPIC_API_KEY"]}
        pendingUpdates={{ PENDING_KEY: "x" }}
        onChange={onChange}
      />,
    );

    // Conflict with existing server-side key
    await user.type(
      screen.getByTestId("agent-env-new-name"),
      "ANTHROPIC_API_KEY",
    );
    await user.click(screen.getByTestId("agent-env-add"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("agent-env-add-error")).toHaveTextContent(
      "SETTINGS$AGENT_ENV_NAME_DUPLICATE",
    );

    // Conflict with pending key (also rejected)
    await user.clear(screen.getByTestId("agent-env-new-name"));
    await user.type(screen.getByTestId("agent-env-new-name"), "PENDING_KEY");
    await user.click(screen.getByTestId("agent-env-add"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens a value input on Replace for an existing key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AcpEnvEditor
        existingKeys={["ANTHROPIC_API_KEY"]}
        pendingUpdates={{}}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("agent-env-replace-ANTHROPIC_API_KEY"));
    expect(onChange).toHaveBeenCalledWith({ ANTHROPIC_API_KEY: "" });
  });

  it("cancels a pending change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AcpEnvEditor
        existingKeys={["ANTHROPIC_API_KEY"]}
        pendingUpdates={{ ANTHROPIC_API_KEY: "new-value" }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("agent-env-cancel-ANTHROPIC_API_KEY"));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("disables Add when name is empty", () => {
    render(
      <AcpEnvEditor
        existingKeys={[]}
        pendingUpdates={{}}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("agent-env-add")).toBeDisabled();
  });
});
