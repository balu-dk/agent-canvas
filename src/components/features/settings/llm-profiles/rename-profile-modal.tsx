import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ProfileNameInput } from "./profile-name-input";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { ApiKeyModalBase } from "#/components/features/settings/api-key-modal-base";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { useRenameLlmProfile } from "#/hooks/mutation/use-rename-llm-profile";
import { displayErrorToast, displaySuccessToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import { PROFILE_NAME_PATTERN } from "#/utils/derive-profile-name";

interface RenameProfileModalProps {
  profile: ProfileInfo | null;
  onClose: () => void;
}

export function RenameProfileModal({
  profile,
  onClose,
}: RenameProfileModalProps) {
  const { t } = useTranslation("openhands");
  const [newName, setNewName] = useState("");
  const renameProfile = useRenameLlmProfile();

  useEffect(() => {
    setNewName(profile?.name ?? "");
  }, [profile?.name]);

  if (!profile) return null;

  const trimmed = newName.trim();
  const isUnchanged = trimmed === profile.name;
  const isValid = PROFILE_NAME_PATTERN.test(trimmed);

  const handleSubmit = async () => {
    if (!isValid) {
      displayErrorToast(t(I18nKey.SETTINGS$PROFILE_NAME_RULE));
      return;
    }
    if (isUnchanged) {
      onClose();
      return;
    }

    try {
      await renameProfile.mutateAsync({ name: profile.name, newName: trimmed });
      displaySuccessToast(
        t(I18nKey.SETTINGS$PROFILE_RENAMED, { name: trimmed }),
      );
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC);
      displayErrorToast(message);
    }
  };

  const footer = (
    <>
      <BrandButton
        testId="rename-profile-submit"
        type="button"
        variant="primary"
        className="grow"
        onClick={handleSubmit}
        isDisabled={renameProfile.isPending || !isValid}
      >
        {renameProfile.isPending ? (
          <LoadingSpinner size="small" />
        ) : (
          t(I18nKey.BUTTON$RENAME)
        )}
      </BrandButton>
      <BrandButton
        type="button"
        variant="secondary"
        className="grow"
        onClick={onClose}
        isDisabled={renameProfile.isPending}
      >
        {t(I18nKey.BUTTON$CANCEL)}
      </BrandButton>
    </>
  );

  return (
    <ApiKeyModalBase
      isOpen
      title={t(I18nKey.SETTINGS$PROFILE_RENAME_TITLE)}
      footer={footer}
    >
      <div data-testid="rename-profile-modal" className="flex flex-col gap-3">
        <ProfileNameInput
          testId="rename-profile-input"
          ruleTestId="rename-profile-rule"
          value={newName}
          onChange={setNewName}
        />
      </div>
    </ApiKeyModalBase>
  );
}
