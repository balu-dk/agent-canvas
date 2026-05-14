import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONTAINER_HOME_DIR,
  CONTAINER_OPENHANDS_DIR,
  CONTAINER_WORKSPACES_DIR,
  buildAgentServerDockerArgs,
  isDockerPermissionDenied,
  resolveDockerUser,
} from "../../scripts/dev-docker.mjs";

describe("CONTAINER_WORKSPACES_DIR", () => {
  it("points at the dockerized agent-server's in-container persistence dir so the working_dir the GUI sends is one the container can mkdir (regression guard for the host-path leak that caused 500 on POST /api/conversations)", () => {
    expect(CONTAINER_WORKSPACES_DIR).toBe(
      "/openhands-home/.openhands/agent-canvas/workspaces",
    );
  });
});

describe("resolveDockerUser", () => {
  it("defaults to the host uid/gid so bind mounts remain writable", () => {
    expect(resolveDockerUser({}, "123:456")).toBe("123:456");
  });

  it("allows callers to use the image default user", () => {
    expect(
      resolveDockerUser({ OH_DOCKER_USER: "image" }, "123:456"),
    ).toBeNull();
  });

  it("allows explicit docker user overrides", () => {
    expect(resolveDockerUser({ OH_DOCKER_USER: "1001:1002" }, "123:456")).toBe(
      "1001:1002",
    );
  });
});

describe("buildAgentServerDockerArgs", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeHomeWithState(): string {
    const home = mkdtempSync(path.join(tmpdir(), "agent-canvas-home-"));
    tempDirs.push(home);
    mkdirSync(path.join(home, ".openhands"), { recursive: true });
    mkdirSync(path.join(home, ".ssh"), { recursive: true });
    return home;
  }

  it("runs the container as the host user and mounts writable state under the container home", () => {
    const home = makeHomeWithState();

    const args = buildAgentServerDockerArgs(
      {
        agentServerPort: 41077,
        sessionApiKey: "session-key",
      },
      {
        PROJECT_PATH: "/projects-host",
      },
      {
        home,
        image: "agent-server:test",
        dockerUser: "123:456",
      },
    );

    expect(args).toContain("--user");
    expect(args).toContain("123:456");
    expect(args).toContain("-v");
    expect(args).toContain("/projects-host:/projects");
    expect(args).toContain(
      `${path.join(home, ".openhands")}:${CONTAINER_OPENHANDS_DIR}`,
    );
    expect(args).toContain(
      `${path.join(home, ".ssh")}:${CONTAINER_HOME_DIR}/.ssh`,
    );
    expect(args).toContain("-e");
    expect(args).toContain(`HOME=${CONTAINER_HOME_DIR}`);
    expect(args).toContain(`OH_PERSISTENCE_DIR=${CONTAINER_OPENHANDS_DIR}`);
    expect(args).toContain(
      `OH_CONVERSATIONS_PATH=${CONTAINER_OPENHANDS_DIR}/agent-canvas/conversations`,
    );
    expect(args).toContain(
      `OH_BASH_EVENTS_DIR=${CONTAINER_OPENHANDS_DIR}/agent-canvas/bash_events`,
    );
    expect(args).toContain(`XDG_CACHE_HOME=${CONTAINER_OPENHANDS_DIR}/cache`);
  });

  it("can opt into the image default user for unusual Docker environments", () => {
    const args = buildAgentServerDockerArgs(
      {
        agentServerPort: 41077,
        sessionApiKey: "session-key",
      },
      {
        PROJECT_PATH: "/projects-host",
        OH_DOCKER_USER: "image",
      },
      {
        home: makeHomeWithState(),
        image: "agent-server:test",
        dockerUser: resolveDockerUser({ OH_DOCKER_USER: "image" }, "123:456"),
      },
    );

    expect(args).not.toContain("--user");
  });
});

describe("isDockerPermissionDenied", () => {
  it("detects Linux docker socket permission failures", () => {
    expect(
      isDockerPermissionDenied(
        "permission denied while trying to connect to the docker API at unix:///var/run/docker.sock",
      ),
    ).toBe(true);
  });

  it("does not treat a missing daemon as a permission failure", () => {
    expect(
      isDockerPermissionDenied(
        "failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running",
      ),
    ).toBe(false);
  });
});
