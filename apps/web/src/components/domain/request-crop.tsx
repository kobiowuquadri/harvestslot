'use client';

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Dialog, DialogContent } from '@/components/ui/primitives';
import { useAction } from '@/lib/mutations';

/** "My crop isn't listed": the farmer asks for a crop; administrators add it or explain why not. */
export function RequestCropButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const send = useAction({
    request: () => ({ path: '/crop-requests', body: { name: name.trim(), ...(note.trim() ? { note: note.trim() } : {}) } }),
    success: 'Thanks. We’ll tell you as soon as you can list it.',
    toastErrors: false,
    onSuccess: () => {
      setOpen(false);
      setName('');
      setNote('');
    },
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 self-start rounded-md text-sm font-medium text-forest hover:underline">
        <MessageSquarePlus className="size-4" aria-hidden /> My crop isn’t listed
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Ask for your crop" description="Tell us what you grow. When buyers for it join, we add it and let you know, so you can list your harvest.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            {send.error ? <Alert tone="danger">{send.error.message}</Alert> : null}
            <Field label="Crop" required error={send.error?.fieldErrors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Okra" maxLength={60} />
            </Field>
            <Field label="Anything buyers should know? (optional)" hint="For example how much you usually have, and when.">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} />
            </Field>
            <Button type="submit" loading={send.isPending} disabled={name.trim().length < 2}>
              Send
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
