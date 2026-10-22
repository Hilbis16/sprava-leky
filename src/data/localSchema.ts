import { z } from 'zod';

const text = z.string();
const number = z.number().finite();
const entity = z.object({ id: text }).passthrough();
const medicationId = { medicationId: text };
const profileId = { profileId: text };
// Zachovává doplňková pole starších verzí, ale odmítá neúplný stav před použitím UI.
export const localDataSchema = z.object({
  schemaVersion: z.literal(1),currentProfileId: text,activeRole: z.enum(['caregiver','senior']),
  profiles: z.array(entity.extend({ displayName: text,initials: text,color: text,timezone: text })),
  memberships: z.array(entity.extend({ ...profileId,userName: text,role: z.enum(['owner','caregiver','senior']) })),
  medications: z.array(entity.extend({ ...profileId,name: text,packageSize: number,unit: z.enum(['tablet','capsule']),prescription: z.boolean(),active: z.boolean(),createdAt: text })),
  regimens: z.array(entity.extend({ ...medicationId,effectiveFrom: text,daysOfWeek: z.array(number),asNeeded: z.boolean(),times: z.array(entity.extend({ time: text,amount: number,period: z.enum(['morning','afternoon','evening']) })) })),
  inventoryEvents: z.array(entity.extend({ ...medicationId,kind: z.enum(['initial','refill','correction']),quantity: number,occurredAt: text })),
  doseActions: z.array(entity.extend({ ...medicationId,...profileId,occurrenceId: text,scheduledAt: text,amount: number,status: z.enum(['taken','skipped']),recordedAt: text,recordedBy: text })),
  prescribers: z.array(entity.extend({ ...profileId,name: text })),
  rxRequests: z.array(entity.extend({ ...medicationId,...profileId,status: z.enum(['draft','sent','completed','dismissed']),channel: z.enum(['sms','email','share']),message: text,createdAt: text })),
  pendingMutations: z.array(entity.extend({ entity: text,payload: z.unknown(),createdAt: text })),
  notificationPreferences: z.object({ missedDoseDelayMinutes: number,stockThresholdDays: z.array(number) }).passthrough(),
}).passthrough();
