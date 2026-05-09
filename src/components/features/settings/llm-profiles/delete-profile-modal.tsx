import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { ApiKeyModalBase } from "#/components/features/settings/api-key-modal-base";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { useDeleteLlmProfile } from "#/hooks/mutation/use-delete-llm-profile";
import { displayErrorToast, displaySuccessToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";

interface DeleteProfileModalProps {
  profile: ProfileInfo | null;
  onClose: () => void;
}

export function DeleteProfileModal({
  profile,
  onClose,
}: DeleteProfileModalProps) {
  const { t } = useTranslation("openhands");
  const deleteProfile = useDeleteLlmProfile();

  if (!profile) return null;

  const handleDelete = async () => {
    try {
      await deleteProfile.mutateAsync(profile.name);
      displaySuccessToast(
        t(I18nKey.SETTINGS$PROFILE_DELETED, { name: profile.name }),
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
        testId="delete-profile-confirm"
        type="button"
        variant="danger"
        className="grow"
        onClick={handleDelete}
        isDisabled={deleteProfile.isPending}
      >
        {deleteProfile.isPending ? (
          <LoadingSpinner size="small" />
        ) : (
          t(I18nKey.BUTTON$DELETE)
        )}
      </BrandButton>
      <BrandButton
        type="button"
        variant="secondary"
        className="grow"
        onClick={onClose}
        isDisabled={deleteProfile.isPending}
      >
        {t(I18nKey.BUTTON$CANCEL)}
      </BrandButton>
    </>
  );

  return (
    <ApiKeyModalBase
      isOpen
      title={t(I18nKey.SETTINGS$PROFILE_DELETE_TITLE)}
      footer={footer}
    >
      <p className="text-sm break-all">
        {t(I18nKey.SETTINGS$PROFILE_DELETE_CONFIRMATION, {
          name: profile.name,
        })}
      </p>
    </ApiKeyModalBase>
  );
}
