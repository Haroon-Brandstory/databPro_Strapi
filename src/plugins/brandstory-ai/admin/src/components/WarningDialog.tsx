import { Button, Dialog, Flex, Typography } from '@strapi/design-system';

export type WarningDialogProps = {
  open: boolean;
  title: string;
  description: string;
  /** Extra warning note shown under the description */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use danger for destructive actions */
  variant?: 'danger' | 'default' | 'secondary';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
};

const WarningDialog = ({
  open,
  title,
  description,
  note,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onOpenChange,
}: WarningDialogProps) => {
  const handleConfirm = async () => {
    try {
      await onConfirm();
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Header>{title}</Dialog.Header>
        <Dialog.Body>
          <Flex direction="column" alignItems="stretch" gap={3}>
            <Dialog.Description>{description}</Dialog.Description>
            {note ? (
              <Typography variant="pi" textColor="danger600">
                Warning: {note}
              </Typography>
            ) : null}
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary" fullWidth disabled={loading}>
              {cancelLabel}
            </Button>
          </Dialog.Cancel>
          <Button
            onClick={handleConfirm}
            variant={variant}
            fullWidth
            loading={loading}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default WarningDialog;
