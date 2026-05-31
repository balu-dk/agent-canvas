import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App, { links } from "#/root";
import { server } from "#/mocks/node";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

const ORIGINAL_LOCATION = window.location;

const TRANSLATIONS: Record<string, string> = {
  COMMON$OPTIONAL: "Optional",
  BACKEND$ADD_TITLE: "Add backend",
  BACKEND$MANAGE_TITLE: "Manage Backends",
  BACKEND$MANAGE_EMPTY: "No backends configured.",
  BACKEND$ADD: "Add backend",
  BACKEND$EDIT: "Edit",
  BACKEND$REMOVE: "Remove",
    BACKEND$TRANSPORT_SAME_ORIGIN: "Same origin",
  BACKEND$TRANSPORT_REMOTE: "Remote",
  BACKEND$KIND_CLOUD: "Cloud",
  BACKEND$VERSION_LABEL: "v{{version}}",
  BACKEND$EDIT_TITLE: "Edit backend",
  BACKEND$NAME_LABEL: "Name",
  BACKEND$NAME_HELPER: "A friendly name for this backend.",
  BACKEND$HOST_LABEL: "Host",
  BACKEND$HOST_HELPER: "Agent server or cloud host URL.",
  BACKEND$KEY_LABEL: "API key",
  BACKEND$CONNECT: "Connect",
  BACKEND$LOGIN_OR: "or",
  BACKEND$CLOUD_TITLE: "OpenHands Cloud",
  BACKEND$CLOUD_DESCRIPTION: "Connect to OpenHands Cloud.",
  BACKEND$LOGIN_WITH_OPENHANDS: "Login with OpenHands",
  BACKEND$ADVANCED: "Advanced",
  BACKEND$LOGIN_CLOUD_HINT: "Use a custom OpenHands Cloud host.",
  BACKEND$SAVE: "Save",
  BUTTON$CANCEL: "Cancel",
  ONBOARDING$BACKEND_STATUS_CONNECTED: "Connected",
  ONBOARDING$BACKEND_STATUS_DISCONNECTED: "Disconnected",
  ONBOARDING$BACKEND_STATUS_CHECKING: "Checking",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      let value = TRANSLATIONS[key] ?? key;
      for (const [optionKey, optionValue] of Object.entries(options ?? {})) {
        value = value.replaceAll(`{{${optionKey}}}`, String(optionValue));
      }
      return value;
    },
  }),
}));

const RouterStub = createRoutesStub([
  {
    Component: App,
    path: "/",
    children: [
      {
        Component: () => <div data-testid="app-outlet">app outlet</div>,
        path: "/",
      },
    ],
  },
]);

const renderApp = (initialEntries: string[] = ["/"]) =>
  render(<RouterStub initialEntries={initialEntries} />, {
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

function stubConfiguredBackend() {
  vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "same-origin");
  __resetActiveStoreForTests();
}

describe("App root agent-server availability guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: ORIGINAL_LOCATION,
    });
  });

  it("renders the routed page even when the connected server reports an old version", async () => {
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.0.0" }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("add-backend-modal")).not.toBeInTheDocument();
  });

  it("renders the routed page when the server omits a version field", async () => {
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0 }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
  });

  it("shows the add-backend dialog without probing the Vite origin when no backend is configured", async () => {
    let serverInfoRequests = 0;

    server.use(
      http.get("*/server_info", () => {
        serverInfoRequests += 1;
        return HttpResponse.error();
      }),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("add-backend-modal")).toBeInTheDocument();
    });

    expect(screen.getByTestId("agent-server-backend-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("add-backend-close")).not.toBeInTheDocument();
    expect(serverInfoRequests).toBe(0);
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("shows the add-backend dialog when the backend rejects the session key", async () => {
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () => new HttpResponse(null, { status: 401 })),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("add-backend-modal")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("shows the add-backend dialog when protected API auth fails", async () => {
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.24.0" }),
      ),
      http.get("*/api/settings", () => new HttpResponse(null, { status: 401 })),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("add-backend-modal")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("adds backend connection details from the startup fallback", async () => {
    const user = userEvent.setup();
    const remoteOrigin = "http://remote-agent.example.com:18000";
    const assign = vi.fn();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: Object.assign(new URL("http://localhost/"), { assign }),
    });
    __resetActiveStoreForTests();

    server.use(
      http.get("*/server_info", ({ request }) => {
        const origin = new URL(request.url).origin;

        if (origin === remoteOrigin) {
          return HttpResponse.json({
            uptime: 0,
            idle_time: 0,
            version: "1.18.0",
          });
        }

        return HttpResponse.error();
      }),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("add-backend-modal")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("add-backend-name"), "Remote");
    const hostInput = screen.getByTestId("add-backend-host");
    await user.type(hostInput, remoteOrigin);
    await user.click(screen.getByTestId("add-backend-submit"));

    expect(window.localStorage.getItem("openhands-backends")).toContain(
      remoteOrigin,
    );
    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("renders the routed page when the agent server is reachable", async () => {
    stubConfiguredBackend();
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("add-backend-modal")).not.toBeInTheDocument();
  });
});

describe("App root document links", () => {
  it("declares the SVG favicon used by the browser tab", () => {
    // Act
    const documentLinks = links();

    // Assert
    expect(documentLinks).toContainEqual({
      rel: "icon",
      type: "image/svg+xml",
      href: "/favicon.svg",
    });
  });
});
