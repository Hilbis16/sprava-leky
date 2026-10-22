import { describe,expect,it } from 'vitest';
import { canEditProfile } from './permissions';
import { createDemoData } from '../data/demo';

describe('Ovládání podle členství',() => {
  it('režim zobrazení nepřiděluje seniorovi právo upravovat',() => {
    const data = createDemoData(),profileId = data.profiles[0]!.id;
    data.activeRole = 'caregiver';
    data.memberships = [{ id: 'member',profileId,userId: 'account',userName: 'Senior',role: 'senior' }];
    expect(canEditProfile(data,'account',profileId)).toBe(false);
    data.memberships[0]!.role = 'caregiver'; expect(canEditProfile(data,'account',profileId)).toBe(true);
    expect(canEditProfile(data,'other',profileId)).toBe(false);
  });
  it('umožní upravit právě založený lokální profil před prvním přenosem',() => {
    const data = createDemoData(),profile = data.profiles[0]!;
    data.memberships = [];
    data.pendingMutations = [{ id: 'new',entity: 'profile',payload: profile,createdAt: new Date().toISOString() }];
    expect(canEditProfile(data,'account',profile.id)).toBe(true);
    data.remoteRevisions = { [profile.id]: 2 }; expect(canEditProfile(data,'account',profile.id)).toBe(false);
    expect(canEditProfile(data,undefined,profile.id)).toBe(true);
  });
});
