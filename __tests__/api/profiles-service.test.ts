import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import { openHands } from "#/api/open-hands-axios";

vi.mock("#/api/open-hands-axios", () => ({
  openHands: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedOpenHands = vi.mocked(openHands);

describe("ProfilesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("listProfiles", () => {
    it("fetches and returns profiles list", async () => {
      const mockResponse = {
        profiles: [
          {
            name: "gpt-4-profile",
            model: "openai/gpt-4",
            base_url: null,
            api_key_set: true,
          },
          {
            name: "claude-profile",
            model: "anthropic/claude-3",
            base_url: "https://api.anthropic.com",
            api_key_set: false,
          },
        ],
        active_profile: null,
      };

      mockedOpenHands.get.mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.listProfiles();

      expect(mockedOpenHands.get).toHaveBeenCalledWith("/api/profiles");
      expect(result).toEqual(mockResponse);
      expect(result.profiles).toHaveLength(2);
    });

    it("returns empty profiles array when no profiles exist", async () => {
      const mockResponse = { profiles: [], active_profile: null };
      mockedOpenHands.get.mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.listProfiles();

      expect(result.profiles).toEqual([]);
    });

    it("propagates fetch errors", async () => {
      mockedOpenHands.get.mockRejectedValue(new Error("Network error"));

      await expect(ProfilesService.listProfiles()).rejects.toThrow(
        "Network error",
      );
    });
  });

  describe("getProfile", () => {
    it("fetches a profile by encoded name", async () => {
      const mockResponse = {
        name: "my profile",
        config: { model: "openai/gpt-4" },
        api_key_set: true,
      };

      mockedOpenHands.get.mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.getProfile("my profile");

      expect(mockedOpenHands.get).toHaveBeenCalledWith(
        "/api/profiles/my%20profile",
        { headers: {} },
      );
      expect(result).toEqual(mockResponse);
    });

    it("passes expose secrets header when set", async () => {
      const mockResponse = {
        name: "my-profile",
        config: { model: "openai/gpt-4", api_key: "encrypted_..." },
        api_key_set: true,
      };

      mockedOpenHands.get.mockResolvedValue({ data: mockResponse });

      await ProfilesService.getProfile("my-profile", "encrypted");

      expect(mockedOpenHands.get).toHaveBeenCalledWith(
        "/api/profiles/my-profile",
        { headers: { "X-Expose-Secrets": "encrypted" } },
      );
    });
  });

  describe("saveProfile", () => {
    it("posts profile save request to encoded profile path", async () => {
      const mockResponse = { name: "new-profile", message: "Profile saved" };
      mockedOpenHands.post.mockResolvedValue({ data: mockResponse });

      const request = {
        llm: {
          model: "openai/gpt-4",
          api_key: "sk-xxx",
        },
        include_secrets: true,
      };

      const result = await ProfilesService.saveProfile("new profile", request);

      expect(mockedOpenHands.post).toHaveBeenCalledWith(
        "/api/profiles/new%20profile",
        request,
      );
      expect(result).toEqual(mockResponse);
    });

    it("saves profile with base_url", async () => {
      const mockResponse = { name: "custom-profile", message: "Profile saved" };
      mockedOpenHands.post.mockResolvedValue({ data: mockResponse });

      const request = {
        llm: {
          model: "openai/gpt-4",
          base_url: "https://custom.api.com",
        },
      };

      await ProfilesService.saveProfile("custom-profile", request);

      expect(mockedOpenHands.post).toHaveBeenCalledWith(
        "/api/profiles/custom-profile",
        request,
      );
    });
  });

  describe("deleteProfile", () => {
    it("deletes a profile by encoded name", async () => {
      const mockResponse = { name: "old-profile", message: "Profile deleted" };
      mockedOpenHands.delete.mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.deleteProfile("old profile");

      expect(mockedOpenHands.delete).toHaveBeenCalledWith(
        "/api/profiles/old%20profile",
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("renameProfile", () => {
    it("posts rename request with new_name", async () => {
      const mockResponse = {
        name: "renamed-profile",
        message: "Profile renamed",
      };
      mockedOpenHands.post.mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.renameProfile(
        "old name",
        "renamed-profile",
      );

      expect(mockedOpenHands.post).toHaveBeenCalledWith(
        "/api/profiles/old%20name/rename",
        { new_name: "renamed-profile" },
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("activateProfile", () => {
    it("posts to activate endpoint with encoded profile name", async () => {
      const mockResponse = {
        name: "active-profile",
        message: "Profile activated",
        llm_applied: true,
      };
      mockedOpenHands.post.mockResolvedValue({ data: mockResponse });

      const result = await ProfilesService.activateProfile("active profile");

      expect(mockedOpenHands.post).toHaveBeenCalledWith(
        "/api/profiles/active%20profile/activate",
        {},
      );
      expect(result).toEqual(mockResponse);
    });
  });
});
