// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { t } from './messages';

describe('t', () => {
  it('returns the string and fills placeholders, leaving unknown ones visible', () => {
    expect(t('nav.newWorkOrder')).toBe('New work order');
    expect(t('list.emptyFiltered', { status: 'Done' })).toBe('No work orders with status Done.');
    expect(t('form.charCount', { count: 12 })).toBe('12 / 2000 characters');
    expect(t('list.emptyFiltered')).toBe('No work orders with status {status}.');
  });
});
