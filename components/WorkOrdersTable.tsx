'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import Link from 'next/link';
import { useState } from 'react';
import { PriorityBadge, StatusBadge } from '@/components/Badges';
import type { Priority, Status, WorkOrder } from '@/lib/api/generated/model';
import { formatTimestamp } from '@/lib/work-orders/format';
import { workOrdersListOptions } from '@/lib/work-orders/list-query';

const PRIORITY_RANK: Record<Priority, number> = { Low: 0, Medium: 1, High: 2 };

const columns: ColumnDef<WorkOrder>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    sortingFn: 'text',
    cell: ({ row }) => (
      <Link
        href={`/work-orders/${row.original.id}`}
        className="break-words font-medium text-blue-800 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: 'priority',
    header: 'Priority',
    sortingFn: (a, b, columnId) =>
      PRIORITY_RANK[a.getValue<Priority>(columnId)] - PRIORITY_RANK[b.getValue<Priority>(columnId)],
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated (UTC)',
    sortingFn: 'basic',
    cell: ({ row }) => (
      <time dateTime={row.original.updatedAt}>{formatTimestamp(row.original.updatedAt)}</time>
    ),
  },
];

/**
 * Sortable work orders table fed by the hydrated list query.
 * @param status Optional status filter; must match the server prefetch so the query key hydrates.
 */
export function WorkOrdersTable({ status }: { status?: Status }) {
  const { data } = useSuspenseQuery(workOrdersListOptions(status));
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }]);

  // TanStack Table v8 returns unmemoizable functions; the React Compiler lint note is expected.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
    enableMultiSort: false,
  });

  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-400 bg-white p-6 text-center">
        {status ? (
          `No work orders with status ${status}.`
        ) : (
          <>
            No work orders yet.{' '}
            <Link href="/work-orders/new" className="font-medium text-blue-800 underline">
              Create a work order
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">
          Work orders{status ? ` with status ${status}` : ''}, sortable by title, priority and last updated
        </caption>
        <thead className="bg-slate-100">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const label = flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : canSort
                            ? 'none'
                            : undefined
                    }
                    className="px-4 py-3 text-sm font-semibold"
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 rounded font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                      >
                        {label}
                        <span aria-hidden="true">
                          {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-200">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
