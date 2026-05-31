import { BackendFormModal } from "./backend-form-modal";

interface AddBackendModalProps {
  onClose: () => void;
  showCloseButton?: boolean;
}

export function AddBackendModal({
  onClose,
  showCloseButton,
}: AddBackendModalProps) {
  return (
    <BackendFormModal
      mode="add"
      onClose={onClose}
      showCloseButton={showCloseButton}
    />
  );
}
