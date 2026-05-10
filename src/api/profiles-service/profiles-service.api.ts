import { openHands } from "../open-hands-axios";

export interface ProfileInfo {
  name: string;
  model: string | null;
  base_url: string | null;
  api_key_set: boolean;
}

export interface ProfileListResponse {
  profiles: ProfileInfo[];
  active_profile: string | null;
}

export interface ProfileDetailResponse {
  name: string;
  config: Record<string, unknown>;
  api_key_set: boolean;
}

export interface ProfileMutationResponse {
  name: string;
  message: string;
}

export interface ActivateProfileResponse {
  name: string;
  message: string;
  llm_applied: boolean;
}

export interface SaveProfileRequest {
  llm: {
    model: string;
    base_url?: string | null;
    api_key?: string | null;
  } & Record<string, unknown>;
  include_secrets?: boolean;
}

export type ExposeSecretsMode = "encrypted" | "plaintext";

const profilePath = (name: string) =>
  `/api/profiles/${encodeURIComponent(name)}`;

class ProfilesService {
  static async listProfiles(): Promise<ProfileListResponse> {
    const { data } = await openHands.get<ProfileListResponse>("/api/profiles");
    return data;
  }

  static async getProfile(
    name: string,
    exposeSecrets?: ExposeSecretsMode,
  ): Promise<ProfileDetailResponse> {
    const headers: Record<string, string> = {};
    if (exposeSecrets) {
      headers["X-Expose-Secrets"] = exposeSecrets;
    }

    const { data } = await openHands.get<ProfileDetailResponse>(
      profilePath(name),
      { headers },
    );
    return data;
  }

  static async saveProfile(
    name: string,
    request: SaveProfileRequest,
  ): Promise<ProfileMutationResponse> {
    const { data } = await openHands.post<ProfileMutationResponse>(
      profilePath(name),
      request,
    );
    return data;
  }

  static async deleteProfile(name: string): Promise<ProfileMutationResponse> {
    const { data } = await openHands.delete<ProfileMutationResponse>(
      profilePath(name),
    );
    return data;
  }

  static async renameProfile(
    name: string,
    newName: string,
  ): Promise<ProfileMutationResponse> {
    const { data } = await openHands.post<ProfileMutationResponse>(
      `${profilePath(name)}/rename`,
      { new_name: newName },
    );
    return data;
  }

  static async activateProfile(name: string): Promise<ActivateProfileResponse> {
    const { data } = await openHands.post<ActivateProfileResponse>(
      `${profilePath(name)}/activate`,
      {},
    );
    return data;
  }
}

export default ProfilesService;
