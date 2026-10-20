import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, relativeDays } from './planner';

describe('formatMoney', () => {
  it('uses Indian digit grouping for rupees', () => {
    expect(formatMoney(1_500_000, 'INR')).toBe('₹15,00,000');
  });

  it('formats other currencies without decimals', () => {
    expect(formatMoney(2500, 'USD')).toBe('$2,500');
  });
});

describe('formatDate', () => {
  it('formats ISO dates without shifting the day', () => {
    expect(formatDate('2027-02-14')).toContain('14');
    expect(formatDate('2027-02-14')).toContain('Feb');
  });
});

describe('relativeDays', () => {
  it('names today and tomorrow', () => {
    expect(relativeDays(0)).toBe('Today');
    expect(relativeDays(1)).toBe('Tomorrow');
  });

  it('describes future days', () => {
    expect(relativeDays(10)).toMatch(/10/);
  });
});
