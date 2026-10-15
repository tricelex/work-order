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
  it('renders a row per work order, newest first, with links to the detail page', () => {
    renderTable(orders);
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(screen.getByRole('link', { name: 'Bravo' }).getAttribute('href')).toBe(
      '/work-orders/22222222-2222-4222-8222-222222222222',
    );
    expect(ariaSort(/updated/i)).toBe('descending');
  });

  it('sorts by priority Low to High, then toggles to High to Low', async () => {
    const user = userEvent.setup();
    renderTable(orders);

    await user.click(screen.getByRole('button', { name: /priority/i }));
    expect(titles()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(ariaSort(/priority/i)).toBe('ascending');
    expect(ariaSort(/updated/i)).toBe('none');

    await user.click(screen.getByRole('button', { name: /priority/i }));
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(ariaSort(/priority/i)).toBe('descending');
  });

  it('sorts titles alphabetically and leaves status unsortable', async () => {
    const user = userEvent.setup();
    renderTable(orders);
    await user.click(screen.getByRole('button', { name: /title/i }));
    expect(titles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(screen.queryByRole('button', { name: /status/i })).toBeNull();
  });

  it('shows an empty state with a create link when no filter is active', () => {
    renderTable([]);
    expect(screen.getByText(/no work orders yet/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /create a work order/i }).getAttribute('href')).toBe(
      '/work-orders/new',
    );
  });

  it('shows a filter-specific empty state without a create link', () => {
    renderTable([], 'Done');
    expect(screen.getByText(/no work orders with status done/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /create a work order/i })).toBeNull();
  });
});
