"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PushPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function PushPromptModal({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  loading = false,
}: PushPromptModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>הפעל התראות</DialogTitle>
          <DialogDescription>
            הפעל התראות כדי לקבל עדכונים על פתיחת הרשמה ותזכורות למשחק.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            לא עכשיו
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'מפעיל...' : 'הפעל'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
