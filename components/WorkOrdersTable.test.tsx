import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Status, WorkOrder } from '@/lib/api/generated/model';
import { workOrdersListOptions } from '@/lib/work-orders/list-query';
import { WorkOrdersTable } from './WorkOrdersTable';

const orders: WorkOrder[] = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'Alpha', description: '', priority: 'Medium', status: 'Open', updatedAt: '2026-01-02T10:00:00.000Z' },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Bravo', description: '', priority: 'High', status: 'In Progress', updatedAt: '2026-01-03T10:00:00.000Z' },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Charlie', description: '', priority: 'Low', status: 'Done', updatedAt: '2026-01-01T10:00:00.000Z' },
];

function renderTable(data: WorkOrder[], status?: Status) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(workOrdersListOptions(status).queryKey, data);
  return render(
    <QueryClientProvider client={client}>
      <WorkOrdersTable status={status} />
    </QueryClientProvider>,
  );
}

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0].textContent);

const ariaSort = (name: RegExp) =>
  screen.getByRole('columnheader', { name }).getAttribute('aria-sort');

describe('WorkOrdersTable', () => {
  it('renders rows newest first and sorts by priority with aria-sort', async () => {
    const user = userEvent.setup();
    renderTable(orders);
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(ariaSort(/updated/i)).toBe('descending');

    await user.click(screen.getByRole('button', { name: /priority/i }));
    expect(titles()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(ariaSort(/priority/i)).toBe('ascending');

    await user.click(screen.getByRole('button', { name: /priority/i }));
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(ariaSort(/priority/i)).toBe('descending');
  });
});
