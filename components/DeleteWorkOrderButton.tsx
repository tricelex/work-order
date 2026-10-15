'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ApiRequestError } from '@/lib/api/fetcher';
import { getListWorkOrdersQueryKey, useDeleteWorkOrder } from '@/lib/api/generated/api';
import { t } from '@/lib/i18n/messages';

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
    } catch (error) {
      // Already deleted elsewhere: the goal (it is gone) is met, so carry on.
      if (!(error instanceof ApiRequestError && error.status === 404)) {
        setError(t('delete.error'));
        setSubmitting(false);
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
    router.push('/?notice=deleted');
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="btn-danger">
        {t('delete.button')}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-dialog-title"
        onClose={() => setError(null)}
        onCancel={(event) => {
          if (submitting) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg p-6 backdrop:bg-black/50"
      >
        <h2 id="delete-dialog-title" className="text-lg font-semibold">
          {t('delete.title')}
        </h2>
        <p className="mt-2 break-words">
          {t('delete.body', { title })}
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
            {t('delete.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            aria-busy={submitting}
            className="btn-danger"
          >
            {t('delete.confirm')}
          </button>
        </div>
      </dialog>
    </>
  );
}
