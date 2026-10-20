import { describe, expect, it } from 'vitest';
import { initialDetailValues, parseAmount, validateDetails, type DetailValues } from './details';

const TODAY = '2026-10-20';

function values(over: Partial<DetailValues> = {}): DetailValues {
  return { eventType: 'wedding', date: '2027-02-14', guests: '120', budget: '15,00,000', currency: 'INR', location: ' Kolkata ', ...over };
}

describe('parseAmount', () => {
  it('ignores separators people type', () => {
    expect(parseAmount('15,00,000')).toBe(1_500_000);
    expect(parseAmount('1 500_000')).toBe(1_500_000);
    expect(Number.isNaN(parseAmount('lots'))).toBe(true);
  });
});

describe('initialDetailValues', () => {
  it('fills known values and defaults the rest', () => {
    expect(initialDetailValues({ guests: 30 })).toEqual({ eventType: '', date: '', guests: '30', budget: '', currency: 'INR', location: '' });
  });
});

describe('validateDetails', () => {
  it('returns typed input for valid values', () => {
    const { input, errors } = validateDetails(['eventType', 'date', 'guests', 'budget', 'location'], values(), TODAY);
    expect(errors).toEqual({});
    expect(input).toEqual({ eventType: 'wedding', date: '2027-02-14', guests: 120, budget: 1_500_000, currency: 'INR', location: 'Kolkata' });
  });

  it('only validates the fields it was asked about', () => {
    const { input, errors } = validateDetails(['date'], values({ guests: 'abc' }), TODAY);
    expect(errors).toEqual({});
    expect(input).toEqual({ date: '2027-02-14' });
  });

  it('reports each invalid field', () => {
    const { errors } = validateDetails(
      ['eventType', 'date', 'guests', 'budget'],
      values({ eventType: 'funeral', date: '2020-01-01', guests: '0', budget: '-5' }),
      TODAY,
    );
    expect(Object.keys(errors).sort()).toEqual(['budget', 'date', 'eventType', 'guests']);
  });

  it('accepts today but not yesterday', () => {
    expect(validateDetails(['date'], values({ date: TODAY }), TODAY).errors).toEqual({});
    expect(validateDetails(['date'], values({ date: '2026-10-19' }), TODAY).errors.date).toBeDefined();
  });

  it('rejects fractional or oversized guest counts', () => {
    expect(validateDetails(['guests'], values({ guests: '12.5' }), TODAY).errors.guests).toBeDefined();
    expect(validateDetails(['guests'], values({ guests: '10001' }), TODAY).errors.guests).toBeDefined();
  });
});
