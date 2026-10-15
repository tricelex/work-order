'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { getListWorkOrdersQueryKey, useDeleteWorkOrder } from '@/lib/api/generated/api';

/**
 * Delete control with a native modal confirmation dialog (Escape closes it).
 * @param id Work order id.
 * @param title Shown in the confirmation text.
 */
export function DeleteWorkOrderButton({ id, title }: { id: string; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const remove = useDeleteWorkOrder();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await remove.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
      router.push('/?notice=deleted');
    } catch {
      setError('Could not delete the work order. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="btn-danger">
        Delete
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-dialog-title"
        onClose={() => setError(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg p-6 backdrop:bg-black/50"
      >
        <h2 id="delete-dialog-title" className="text-lg font-semibold">
          Delete this work order?
        </h2>
        <p className="mt-2 break-words">
          “{title}” will be permanently deleted. This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-red-700 bg-red-50 px-3 py-2 text-red-950">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={submitting}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            aria-busy={submitting}
            className="btn-danger"
          >
            Delete work order
          </button>
        </div>
      </dialog>
    </>
  );
}
