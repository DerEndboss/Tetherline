import { describe, expect, it } from 'vitest';
import { formatAmount, formatCost } from './format';

describe('formatAmount', () => {
  it('shows whole numbers with grouping below ten thousand', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(7.9)).toBe('7');
    expect(formatAmount(1234)).toBe('1,234');
  });

  it('switches to compact notation for big numbers', () => {
    expect(formatAmount(12_345)).toBe('12.3K');
    expect(formatAmount(4_500_000)).toBe('4.5M');
  });

  it('formats a cost list', () => {
    expect(formatCost([{ id: 'a', amount: 25 }, { id: 'b', amount: 10 }], (id) => id.toUpperCase())).toBe('25 A, 10 B');
  });
});

describe('formatShort', () => {
  it('keeps small numbers and shortens big ones with k and M', async () => {
    const { formatShort } = await import('./format');
    expect(formatShort(950)).toBe('950');
    expect(formatShort(1349)).toBe('1.3k');
    expect(formatShort(12_000)).toBe('12k');
    expect(formatShort(250_400)).toBe('250k');
    expect(formatShort(4_560_000)).toBe('4.5M');
  });
});
