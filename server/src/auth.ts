import { betterAuth } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';
import nodemailer from 'nodemailer';
import type pg from 'pg';
import type { Config } from './config';

export type SendCode = (email: string, code: string) => Promise<void>;
export function createAuth(config: Config, pool: pg.Pool, deliver?: SendCode) {
  const smtp = config.SMTP_HOST ? nodemailer.createTransport({
    host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_PORT === 465,
    requireTLS: config.NODE_ENV === 'production' && config.SMTP_PORT !== 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  }) : null;
  return betterAuth({
    database: pool, secret: config.AUTH_SECRET, baseURL: config.PUBLIC_API_URL,
    trustedOrigins: config.origins,
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    plugins: [bearer(), emailOTP({
      otpLength: 6, expiresIn: 300, allowedAttempts: 3, storeOTP: 'hashed',
      async sendVerificationOTP({ email, otp }) {
        if (deliver) return deliver(email, otp);
        if (!smtp) throw new Error('Odesílání přihlašovacích e-mailů není nastavené.');
        await smtp.sendMail({ from: config.MAIL_FROM, to: email, subject: 'Přihlášení do Moje léky',
          text: `Váš jednorázový přihlašovací kód je ${otp}. Platí pět minut. Pokud jste o přihlášení nežádali, zprávu ignorujte.` });
      },
    })],
  });
}
