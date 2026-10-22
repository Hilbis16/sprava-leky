import { z } from 'zod';
import { mutationSchema } from '../../src/domain/validation';
export { mutationSchema, type Mutation } from '../../src/domain/validation';

const id = z.string().uuid();
export const syncSchema = z.object({
  mutations: z.array(mutationSchema).max(5000),
  revisions: z.record(z.string().uuid(), z.number().int().nonnegative()).default({}),
  force: z.boolean().default(false),
});
export const inviteSchema = z.object({ profileId: id, role: z.enum(['caregiver', 'senior']) });
export const deviceSchema = z.object({ pushToken: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/), platform: z.enum(['android', 'ios']) });
