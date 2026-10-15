import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrder } from '@/lib/api/generated/model';
import { WorkOrderForm } from './WorkOrderForm';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderForm(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const saved: WorkOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Replace filter',
  description: '',
  priority: 'High',
  status: 'Open',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

describe('WorkOrderForm', () => {
  it('shows server field errors, flags the fields, keeps input and focuses the first invalid field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            fieldErrors: {
              title: ['Title must be at least 2 characters'],
              description: ['Description must be at most 2000 characters'],
            },
          },
        },
        400,
      ),
    );
    const user = userEvent.setup();
    renderForm(<WorkOrderForm mode="create" />);

    const title = screen.getByLabelText('Title (required)');
    const description = screen.getByLabelText(/^Description/) as HTMLTextAreaElement;
    await user.type(title, 'a');
    await user.type(description, 'keep me');
    await user.click(screen.getByRole('button', { name: 'Create work order' }));

    expect(await screen.findByText('Title must be at least 2 characters')).toBeTruthy();
    expect(screen.getByText('Description must be at most 2000 characters')).toBeTruthy();
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toContain('title-error');
    expect(description.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(title);
    expect(description.value).toBe('keep me');
    expect(push).not.toHaveBeenCalled();
  });

  it('sends the typed payload once, locks the form while pending and navigates on success', async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => { respond = resolve; }),
    );
    const user = userEvent.setup();
    renderForm(<WorkOrderForm mode="create" />);

    await user.type(screen.getByLabelText('Title (required)'), 'Replace filter');
    await user.selectOptions(screen.getByLabelText('Priority (required)'), 'High');
    const submit = screen.getByRole('button', { name: 'Create work order' }) as HTMLButtonElement;
    await user.click(submit);

    await waitFor(() => expect(submit.disabled).toBe(true));
    expect(submit.getAttribute('aria-busy')).toBe('true');
    await user.dblClick(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/work-orders');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Replace filter',
      description: '',
      priority: 'High',
    });

    respond(jsonResponse(saved, 201));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/work-orders/${saved.id}?notice=created`),
    );
  });
});
