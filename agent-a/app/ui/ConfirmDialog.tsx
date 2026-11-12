'use client';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** Every destructive action: states the consequence in one sentence and names the action on its button. */
export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  onConfirm,
  onClose,
  pending = false,
  destructive = true,
}: {
  open: boolean;
  title: string;
  consequence: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  destructive?: boolean;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'primary'} pending={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm">{consequence}</p>
    </Dialog>
  );
}
