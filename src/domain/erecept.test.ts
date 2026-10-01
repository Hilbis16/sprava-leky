import { describe, expect, it } from 'vitest';
import { normalizeEreceptId } from './erecept';

describe('normalizeEreceptId', () => {
  it('přijme samostatný kód s mezerami', () => expect(normalizeEreceptId('PD4R 54LQ FRNW')).toBe('PD4R54LQFRNW'));
  it('vyčte identifikátor z URL', () => expect(normalizeEreceptId('https://erpid.info/erp?i=PD4R54LQFRNW&s=14.9.2026')).toBe('PD4R54LQFRNW'));
  it('odmítne cizí QR', () => expect(normalizeEreceptId('https://example.com/menu')).toBeNull());
});
