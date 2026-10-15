import Link from 'next/link';
import { Status } from '@/lib/api/generated/model';

const FILTERS: { label: string; status?: Status }[] = [
  { label: 'All' },
  ...Object.values(Status).map((status) => ({ label: status, status })),
];

/** Status filter as plain links driven by `?status=`; works without JavaScript. */
export function StatusFilter({ active }: { active?: Status }) {
  return (
    <nav aria-label="Filter by status">
      <ul className="flex flex-wrap gap-2">
        {FILTERS.map(({ label, status }) => {
          const isActive = status === active;
          return (
            <li key={label}>
              <Link
                href={status ? `/?status=${encodeURIComponent(status)}` : '/'}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-block rounded-full border px-4 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                  isActive
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
