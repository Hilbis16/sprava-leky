-- SÚKL katalog se v pilotu plní měsíčním importem otevřených dat DLP.
insert into public.sukl_catalog (sukl_code, name, strength, pharmaceutical_form, package_label) values
  ('0000001', 'Atorvastatin', '20 mg', 'tableta', '90 tablet'),
  ('0000002', 'Concor', '5 mg', 'tableta', '30 tablet'),
  ('0000003', 'Godasal', '100 mg', 'tableta', '50 tablet')
on conflict (sukl_code) do update set name = excluded.name, strength = excluded.strength, package_label = excluded.package_label, updated_at = now();
