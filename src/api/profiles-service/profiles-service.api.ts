/**
 * ProfilesService provides a thin wrapper around the SDK's ProfilesClient,
 * creating a client per-call to pick up current backend configuration.
 *
 * All types are re-exported from the SDK for consumer convenience.
 */
import {
  createProfilesClient,
  type ProfileInfo,
  type ProfileListResponse,
  type ProfileDetailResponse,
  type ProfileMutationResponse,
  type ActivateProfileResponse,
  type SaveProfileRequest,
  type ExposeSecretsMode,
  type GetProfileOptions,
} from "../typescript-client";

// Re-export SDK types for consumers
export type {
  ProfileInfo,
  ProfileListResponse,
  ProfileDetailResponse,
  ProfileMutationResponse,
  ActivateProfileResponse,
  SaveProfileRequest,
  ExposeSecretsMode,
};

class ProfilesService {
  static async listProfiles(): Promise<ProfileListResponse> {
    const client = createProfilesClient();
    try {
      return await client.listProfiles();
    } finally {
      client.close();
    }
  }

  static async getProfile(
    name: string,
    exposeSecrets?: ExposeSecretsMode,
  ): Promise<ProfileDetailResponse> {
    const client = createProfilesClient();
    try {
      const options: GetProfileOptions = exposeSecrets
        ? { exposeSecrets }
        : {};
      return await client.getProfile(name, options);
    } finally {
      client.close();
    }
  }

  static async saveProfile(
    name: string,
    request: SaveProfileRequest,
  ): Promise<ProfileMutationResponse> {
    const client = createProfilesClient();
    try {
      return await client.saveProfile(name, request);
    } finally {
      client.close();
    }
  }

  static async deleteProfile(name: string): Promise<ProfileMutationResponse> {
    const client = createProfilesClient();
    try {
      return await client.deleteProfile(name);
    } finally {
      client.close();
    }
  }

  static async renameProfile(
    name: string,
    newName: string,
  ): Promise<ProfileMutationResponse> {
    const client = createProfilesClient();
    try {
      return await client.renameProfile(name, newName);
    } finally {
      client.close();
    }
  }

  static async activateProfile(name: string): Promise<ActivateProfileResponse> {
    const client = createProfilesClient();
    try {
      return await client.activateProfile(name);
    } finally {
      client.close();
    }
  }
}

export default ProfilesService;
