import { z } from 'zod';

// Stejný kontrakt pro formuláře, lokální frontu i HTTP API.
export const limits = { profileName: 120, medicationName: 180, contactName: 180, phone: 50, email: 254, text: 500, quantity: 1_000_000 } as const;
const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label} je povinný údaj.`).max(max, `${label}: nejvýše ${max} znaků.`);
const optionalText = (label: string, max: number) => z.string().max(max, `${label}: nejvýše ${max} znaků.`).optional();
const id = z.string().uuid();
const dateTime = z.string().datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Zadejte platné datum.');
export const quantitySchema = z.number({ error: 'Zadejte konečný počet kusů.' }).finite('Zadejte konečný počet kusů.')
  .min(-limits.quantity, 'Počet kusů nesmí být menší než −1 000 000.').max(limits.quantity, 'Počet kusů nesmí být větší než 1 000 000.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Počet kusů může mít nejvýše dvě desetinná místa.');
export const positiveQuantitySchema = quantitySchema.positive('Počet kusů musí být větší než nula.');
export const countedStockSchema = quantitySchema.nonnegative('Počet zbývajících kusů nesmí být záporný.');
export const parseQuantity = (value: string): number => value.trim() ? Number(value.trim().replace(',', '.')) : NaN;
export const profileNameSchema = requiredText('Jméno osoby', limits.profileName);
const text = optionalText('Text', limits.text);
export const profileSchema = z.object({ id, displayName: profileNameSchema, color: z.string().regex(/^#[0-9a-fA-F]{6}$/), timezone: z.literal('Europe/Prague'), initials: z.string().max(10) });
const inventory = z.object({ id, medicationId: id, kind: z.enum(['initial', 'refill', 'correction']), quantity: quantitySchema, occurredAt: dateTime, note: text });
const medication = z.object({ id, profileId: id, name: requiredText('Název léku', limits.medicationName), strength: optionalText('Síla léku', limits.text), packageSize: positiveQuantitySchema, unit: z.enum(['tablet', 'capsule']), prescription: z.boolean(), ereceptId: z.string().regex(/^[A-Z0-9]{12}$/).optional(), suklCode: z.string().max(30).optional(), note: optionalText('Pokyny', limits.text), active: z.boolean(), createdAt: dateTime });
const dose = z.object({ id: z.string().min(1).max(100), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Čas zadejte ve tvaru 08:00.'), amount: positiveQuantitySchema, period: z.enum(['morning', 'afternoon', 'evening']) });
const days = z.array(z.number().int().min(0).max(6)).max(7);
const regimen = z.object({ id, medicationId: id, effectiveFrom: date, endsOn: date.optional(), daysOfWeek: days, asNeeded: z.boolean(), times: z.array(dose).max(24) });
export const medicineDetailsSchema = medication.pick({ name: true, strength: true, note: true });
export const medicineDraftSchema = medication.omit({ id: true, active: true, createdAt: true, suklCode: true }).extend({
  endsOn: date.optional(), daysOfWeek: days.min(1, 'Vyberte alespoň jeden den v týdnu.'),
  times: z.array(dose.omit({ id: true })).min(1, 'Vyberte alespoň jednu denní dávku.').max(24),
});
export const contactSchema = z.object({ id, profileId: id, kind: z.enum(['doctor', 'pharmacy']).default('doctor'), name: requiredText('Název kontaktu', limits.contactName), phone: optionalText('Telefon', limits.phone), email: optionalText('E-mail', limits.email) });
const payloads = {
  profile: profileSchema,
  profile_remove: z.object({ id }),
  medication: z.object({ medication, regimen, inventory: inventory.optional() }).refine((value) => value.medication.id === value.regimen.medicationId && (!value.inventory || value.inventory.medicationId === value.medication.id), 'Nesouhlasí identifikátory léku.'),
  inventory_event: inventory,
  dose_action: z.object({ id, occurrenceId: z.string().min(1).max(100), medicationId: id, profileId: id, scheduledAt: dateTime, amount: positiveQuantitySchema, status: z.enum(['taken', 'skipped']), recordedAt: dateTime, recordedBy: z.string().max(120) }).refine((value) => value.occurrenceId === `${value.medicationId}:${new Date(value.scheduledAt).toISOString()}`, 'Nesouhlasí identifikátor dávky.'),
  dose_action_undo: z.object({ occurrenceId: z.string().min(1).max(100), medicationId: id, profileId: id }),
  prescriber: contactSchema,
  prescriber_remove: z.object({ id }),
  rx_request: z.object({ id, profileId: id, medicationId: id, status: z.enum(['draft', 'sent', 'completed', 'dismissed']), channel: z.enum(['sms', 'email', 'share']), message: z.string().max(10000, 'Zpráva může mít nejvýše 10 000 znaků.'), createdAt: dateTime, sentAt: dateTime.optional(), completedAt: dateTime.optional() }),
};

export type Mutation = { [K in keyof typeof payloads]: { id: string; entity: K; createdAt: string; payload: z.infer<typeof payloads[K]> } }[keyof typeof payloads];
export const mutationSchema = z.object({
  id: z.string().min(1).max(250),
  entity: z.enum(['profile', 'profile_remove', 'medication', 'inventory_event', 'dose_action', 'dose_action_undo', 'prescriber', 'prescriber_remove', 'rx_request']),
  createdAt: dateTime, payload: z.unknown(),
}).transform((value, ctx) => {
  const result = payloads[value.entity].safeParse(value.payload);
  if (!result.success) {
    for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: ['payload', ...issue.path] });
    return z.NEVER;
  }
  return { ...value, payload: result.data } as Mutation;
});

export function validationMessage(error: unknown): string {
  return error instanceof z.ZodError ? error.issues[0]?.message ?? 'Zkontrolujte zadané údaje.' : 'Zkontrolujte zadané údaje.';
}
