import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  APP_WEB_URL: z.string().url().default('http://localhost:8081'),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY: z.string().default('false'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Moje léky <noreply@localhost>'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  MISSED_DOSE_DELAY_MINUTES: z.coerce.number().int().min(1).max(1440).default(120),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const value = schema.parse(env);
  if (value.NODE_ENV === 'production' && value.AUTH_SECRET.startsWith('change-')) {
    throw new Error('Nahraďte ukázkový AUTH_SECRET náhodnou tajnou hodnotou.');
  }
  if (value.NODE_ENV === 'production' && (!value.SMTP_HOST
    || !value.PUBLIC_API_URL.startsWith('https://') || !value.APP_WEB_URL.startsWith('https://'))) {
    throw new Error('Produkce vyžaduje HTTPS, SMTP a ověřování e-mailových adres.');
  }
  return { ...value, origins: value.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean) };
}
export type Config = ReturnType<typeof readConfig>;
