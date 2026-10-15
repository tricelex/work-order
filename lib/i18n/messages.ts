const en = {
  'app.name': 'Work Orders',
  'app.description': 'Manage technician work orders.',
  'nav.skip': 'Skip to content',
  'nav.newWorkOrder': 'New work order',

  'list.title': 'All work orders',
  'list.heading': 'Work orders',
  'list.filterLabel': 'Filter by status',
  'list.filterAll': 'All',
  'list.empty': 'No work orders yet.',
  'list.emptyCreate': 'Create a work order',
  'list.emptyFiltered': 'No work orders with status {status}.',
  'list.caption': 'Work orders, sortable by title, priority and last updated',
  'list.captionFiltered':
    'Work orders with status {status}, sortable by title, priority and last updated',

  'column.title': 'Title',
  'column.priority': 'Priority',
  'column.status': 'Status',
  'column.updated': 'Updated (UTC)',

  'notice.created': 'Work order created.',
  'notice.updated': 'Work order updated.',
  'notice.deleted': 'Work order deleted.',

  'detail.description': 'Description',
  'detail.noDescription': 'No description provided.',
  'detail.updated': 'Last updated (UTC)',
  'detail.id': 'ID',
  'detail.edit': 'Edit',
  'detail.back': '← Back to all work orders',

  'form.newTitle': 'New work order',
  'form.editTitle': 'Edit work order',
  'form.title': 'Title (required)',
  'form.description': 'Description (optional)',
  'form.priority': 'Priority (required)',
  'form.status': 'Status (required)',
  'form.charCount': '{count} / 2000 characters',
  'form.create': 'Create work order',
  'form.save': 'Save changes',
  'form.cancel': 'Cancel',
  'form.error': 'Could not save the work order. Please try again.',

  'delete.button': 'Delete',
  'delete.title': 'Delete this work order?',
  'delete.body': '“{title}” will be permanently deleted. This cannot be undone.',
  'delete.cancel': 'Cancel',
  'delete.confirm': 'Delete work order',
  'delete.error': 'Could not delete the work order. Please try again.',

  'notFound.title': 'Not found',
  'notFound.body': 'We could not find that page or work order.',
  'notFound.back': 'Back to all work orders',

  'error.title': 'Something went wrong',
  'error.body': 'The page could not be loaded. Please try again.',
  'error.retry': 'Try again',
} as const;

export type MessageKey = keyof typeof en;

const dictionaries = { en } satisfies Record<string, Record<MessageKey, string>>;

export type Locale = keyof typeof dictionaries;
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Looks up a UI string and fills `{name}` placeholders.
 * @param key Message key; unknown keys are a compile error.
 * @param vars Values for `{name}` placeholders.
 * @param locale Dictionary to read from (only `en` exists today).
 */
export function t(
  key: MessageKey,
  vars: Record<string, string | number> = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  return dictionaries[locale][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(vars[name] ?? `{${name}}`),
  );
}
