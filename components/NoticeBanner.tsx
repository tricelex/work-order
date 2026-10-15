import { t } from '@/lib/i18n/messages';

const NOTICES = ['created', 'updated', 'deleted'] as const;

function isNotice(value: unknown): value is (typeof NOTICES)[number] {
  return NOTICES.some((notice) => notice === value);
}

/** Shows a post-redirect confirmation from `?notice=created|updated|deleted`. */
export function NoticeBanner({ notice }: { notice?: string | string[] }) {
  if (!isNotice(notice)) return null;
  return (
    <p
      role="status"
      className="mb-4 rounded-md border border-green-600 bg-green-50 px-4 py-3 text-green-950"
    >
      {t(`notice.${notice}`)}
    </p>
  );
}
