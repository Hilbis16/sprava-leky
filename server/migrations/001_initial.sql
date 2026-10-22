-- Better Auth tables. Password hashing and session validation are owned by the library.
CREATE TABLE public."user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.session (
  id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES public."user" ON DELETE CASCADE
);
CREATE INDEX ON public.session ("userId");
CREATE TABLE public.account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES public."user" ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
  scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX ON public.account ("userId");
CREATE TABLE public.verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.verification (identifier);

CREATE SCHEMA app;
CREATE TABLE app.care_profiles (
  id uuid PRIMARY KEY, display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'), timezone text NOT NULL DEFAULT 'Europe/Prague',
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.memberships (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES app.care_profiles ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user" ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'caregiver', 'senior')), UNIQUE (profile_id, user_id)
);
CREATE INDEX ON app.memberships (user_id);
CREATE TABLE app.medications (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES app.care_profiles ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180), strength text, package_size numeric(10,2) NOT NULL CHECK (package_size > 0),
  unit text NOT NULL CHECK (unit IN ('tablet', 'capsule')), prescription boolean NOT NULL, erecept_id text,
  sukl_code text, note text, active boolean NOT NULL, created_at timestamptz NOT NULL,
  UNIQUE (id, profile_id), CHECK (erecept_id IS NULL OR erecept_id ~ '^[A-Z0-9]{12}$')
);
CREATE INDEX ON app.medications (profile_id);
CREATE TABLE app.regimen_rules (
  id uuid PRIMARY KEY, medication_id uuid NOT NULL UNIQUE REFERENCES app.medications ON DELETE CASCADE,
  effective_from date NOT NULL, ends_on date, days_of_week smallint[] NOT NULL,
  times jsonb NOT NULL CHECK (jsonb_typeof(times) = 'array'), as_needed boolean NOT NULL,
  CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
CREATE TABLE app.inventory_events (
  id uuid PRIMARY KEY, medication_id uuid NOT NULL REFERENCES app.medications ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('initial', 'refill', 'correction')), quantity numeric(12,2) NOT NULL,
  occurred_at timestamptz NOT NULL, note text
);
CREATE INDEX ON app.inventory_events (medication_id);
CREATE TABLE app.dose_actions (
  id uuid PRIMARY KEY, occurrence_id text NOT NULL UNIQUE, medication_id uuid NOT NULL, profile_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL, amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('taken', 'skipped')), recorded_at timestamptz NOT NULL,
  recorded_by text REFERENCES public."user",
  FOREIGN KEY (medication_id, profile_id) REFERENCES app.medications(id, profile_id) ON DELETE CASCADE
);
CREATE INDEX ON app.dose_actions (profile_id, scheduled_at);
CREATE TABLE app.prescriber_contacts (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES app.care_profiles ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('doctor', 'pharmacy')), name text NOT NULL, phone text, email text
);
CREATE INDEX ON app.prescriber_contacts (profile_id);
CREATE TABLE app.rx_requests (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL, medication_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'sent', 'completed', 'dismissed')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'share')), message text NOT NULL,
  created_at timestamptz NOT NULL, sent_at timestamptz, completed_at timestamptz,
  FOREIGN KEY (medication_id, profile_id) REFERENCES app.medications(id, profile_id) ON DELETE CASCADE
);
CREATE INDEX ON app.rx_requests (profile_id);
CREATE TABLE app.mobile_mutations (
  user_id text NOT NULL REFERENCES public."user" ON DELETE CASCADE, id text NOT NULL,
  payload_hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, id)
);
CREATE TABLE app.family_invites (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES app.care_profiles ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, role text NOT NULL CHECK (role IN ('caregiver', 'senior')),
  created_by text NOT NULL REFERENCES public."user", expires_at timestamptz NOT NULL,
  used_by text REFERENCES public."user", used_at timestamptz
);
CREATE TABLE app.devices (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public."user" ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES public.session ON DELETE CASCADE,
  push_token text NOT NULL UNIQUE, platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app.devices (user_id);
CREATE TABLE app.push_outbox (
  id bigserial PRIMARY KEY, profile_id uuid NOT NULL REFERENCES app.care_profiles ON DELETE CASCADE,
  medication_id uuid NOT NULL REFERENCES app.medications ON DELETE CASCADE, scheduled_at timestamptz NOT NULL,
  user_id text NOT NULL REFERENCES public."user" ON DELETE CASCADE, push_token text NOT NULL,
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
  UNIQUE (medication_id, scheduled_at, push_token)
);
CREATE INDEX ON app.push_outbox (next_attempt_at) WHERE sent_at IS NULL;
