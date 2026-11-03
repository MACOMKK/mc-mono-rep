import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@macom/ui';

export default function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Confirmar exclusão',
  description = 'Essa ação não pode ser desfeita.',
  confirmLabel = 'Excluir',
  loadingLabel = 'Excluindo...',
  cancelLabel = 'Cancelar',
  isLoading = false,
  confirmDisabled = false,
  confirmClassName = 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  children,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading || confirmDisabled}
            className={confirmClassName}
          >
            {isLoading ? loadingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
