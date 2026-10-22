import { describe,expect,it } from 'vitest';
import { createDemoData } from './demo';
import { createEmptyData } from './empty';
import { localDataSchema } from './localSchema';

describe('Ochrana uložených dat při migraci',() => {
  it('načte demo i prázdný účet a zachová doplňková pole',() => {
    const data = { ...createDemoData(),remoteRevisions: { profile: 2 } };
    expect(localDataSchema.parse(data)).toEqual(data);
    expect(localDataSchema.parse(createEmptyData())).toEqual(createEmptyData());
  });
  it('odmítne neúplná data dříve, než se dostanou do obrazovek',() => {
    expect(localDataSchema.safeParse({ schemaVersion: 1 }).success).toBe(false);
    const data = createDemoData();
    expect(localDataSchema.safeParse({ ...data,profiles: [{ id: 'incomplete' }] }).success).toBe(false);
    expect(localDataSchema.safeParse({ ...data,pendingMutations: null }).success).toBe(false);
  });
});
