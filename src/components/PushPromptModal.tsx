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
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-right">הפעל התראות</DialogTitle>
          <DialogDescription className="text-right">
            הפעל התראות כדי לקבל עדכונים על פתיחת הרשמה ותזכורות למשחק.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span>אנא המתן</span>
                <span className="inline-flex items-center gap-0.5">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce [animation-delay:0.15s]">.</span>
                  <span className="animate-bounce [animation-delay:0.3s]">.</span>
                </span>
              </span>
            ) : (
              'הפעל'
            )}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            לא עכשיו
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
