'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { toApiError } from '@/lib/api/fetcher';
import {
  getListWorkOrdersQueryKey,
  useCreateWorkOrder,
  useUpdateWorkOrder,
} from '@/lib/api/generated/api';
import { Priority, Status, type WorkOrder } from '@/lib/api/generated/model';
import { t } from '@/lib/i18n/messages';

type Props = { mode: 'create' } | { mode: 'edit'; initial: WorkOrder };

const FIELD_NAMES: readonly string[] = ['title', 'description', 'priority', 'status'];
type FieldName = 'title' | 'description' | 'priority' | 'status';

const PRIORITIES = Object.values(Priority);
const STATUSES = Object.values(Status);

/** Narrows a submitted form value to one of the allowed options. */
function pick<T extends string>(options: readonly T[], value: FormDataEntryValue | null): T {
  const match = options.find((option) => option === value);
  if (match === undefined) throw new Error('Unexpected form value');
  return match;
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-800">
      {messages.join(' ')}
    </p>
  );
}

/**
 * Create or edit form. Validation is server-side; field errors from the API
 * are shown under each field and focus moves to the first invalid one.
 * @param props `mode: 'create'`, or `mode: 'edit'` with the `initial` work order.
 */
export function WorkOrderForm(props: Props) {
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useCreateWorkOrder();
  const update = useUpdateWorkOrder();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [descriptionLength, setDescriptionLength] = useState(initial?.description.length ?? 0);

  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fieldErrors]);

  function showError(error: unknown) {
    const apiError = toApiError(error);
    if (!apiError) {
      setFormError(t('form.error'));
      return;
    }
    const { message, fieldErrors: all = {} } = apiError.error;
    const entries = Object.entries(all);
    const known = entries.filter(([name]) => FIELD_NAMES.includes(name));
    const other = entries.filter(([name]) => !FIELD_NAMES.includes(name));
    setFieldErrors(Object.fromEntries(known));
    const otherMessages = other.flatMap(([, messages]) => messages).join(' ');
    setFormError(otherMessages || (known.length === 0 ? message : null));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const fields = {
        title: String(data.get('title') ?? ''),
        description: String(data.get('description') ?? ''),
        priority: pick(PRIORITIES, data.get('priority')),
      };
      const saved =
        props.mode === 'create'
          ? await create.mutateAsync({ data: fields })
          : await update.mutateAsync({
              id: props.initial.id,
              data: { ...fields, status: pick(STATUSES, data.get('status')) },
            });
      await queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
      router.push(`/work-orders/${saved.id}?notice=${props.mode === 'create' ? 'created' : 'updated'}`);
    } catch (error) {
      showError(error);
      setSubmitting(false);
    }
  }

  function errorProps(name: FieldName, extraDescribedBy?: string) {
    const invalid = (fieldErrors[name]?.length ?? 0) > 0;
    const describedBy = [invalid ? `${name}-error` : undefined, extraDescribedBy]
      .filter(Boolean)
      .join(' ');
    return {
      'aria-invalid': invalid ? (true as const) : undefined,
      'aria-describedby': describedBy || undefined,
    };
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={submitting} className="max-w-2xl space-y-5">
      <div>
        <label htmlFor="title" className="mb-1 block font-medium">
          {t('form.title')}
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={80}
          defaultValue={initial?.title}
          className="field"
          {...errorProps('title')}
        />
        <FieldError id="title-error" messages={fieldErrors.title} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block font-medium">
          {t('form.description')}
        </label>
        <textarea
          id="description"
          name="description"
          rows={6}
          maxLength={2000}
          defaultValue={initial?.description}
          onChange={(event) => setDescriptionLength(event.target.value.length)}
          className="field"
          {...errorProps('description', 'description-count')}
        />
        <p id="description-count" className="mt-1 text-sm text-slate-700">
          {t('form.charCount', { count: descriptionLength })}
        </p>
        <FieldError id="description-error" messages={fieldErrors.description} />
      </div>

      <div>
        <label htmlFor="priority" className="mb-1 block font-medium">
          {t('form.priority')}
        </label>
        <select
          id="priority"
          name="priority"
          required
          defaultValue={initial?.priority ?? Priority.Medium}
          className="field"
          {...errorProps('priority')}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
        <FieldError id="priority-error" messages={fieldErrors.priority} />
      </div>

      {initial && (
        <div>
          <label htmlFor="status" className="mb-1 block font-medium">
            {t('form.status')}
          </label>
          <select
            id="status"
            name="status"
            required
            defaultValue={initial.status}
            className="field"
            {...errorProps('status')}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <FieldError id="status-error" messages={fieldErrors.status} />
        </div>
      )}

      {formError && (
        <p role="alert" className="rounded-md border border-red-700 bg-red-50 px-4 py-3 text-red-950">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={submitting} aria-busy={submitting} className="btn-primary">
          {props.mode === 'create' ? t('form.create') : t('form.save')}
        </button>
        <Link
          href={props.mode === 'create' ? '/' : `/work-orders/${props.initial.id}`}
          className="btn-secondary"
        >
          {t('form.cancel')}
        </Link>
      </div>
    </form>
  );
}
