# Provoz vlastní služby

[Vývoj](DEVELOPMENT.md) · [Přenos dat](MIGRATION.md) · [Stav](STATUS.md)

## První nasazení

Provozujte jednu instanci API a workeru a jednu PostgreSQL databázi. API může běžet v kontejneru, PostgreSQL na vlastním serveru nebo u spravovaného poskytovatele. Telefon zná pouze veřejnou URL API.

docker-compose.yml je vývojová konfigurace s Mailpit a NODE_ENV=development. Pro veřejný provoz připravte HTTPS proxy a skutečné SMTP. Repozitář žádný hosting automaticky neobjednává.

Nastavte:

- NODE_ENV=production, silný unikátní AUTH_SECRET, serverový DATABASE_URL a účet s nezbytnými databázovými oprávněními. Pro migrace použijte oddělený účet s DDL oprávněním. Tyto údaje nepatří do klienta.
- PUBLIC_API_URL=https://api.example.cz, APP_WEB_URL=https://app.example.cz, přesný CORS_ORIGINS. Web a API provozujte na HTTPS pod stejnou hlavní doménou kvůli session cookies.
- SMTP_HOST, SMTP_PORT, přihlašovací údaje a MAIL_FROM ověřené domény. Ověřte skutečné doručení kódů a SMTP limity.
- HOST=0.0.0.0 v kontejneru. TRUST_PROXY omezte na adresy důvěryhodné proxy, která přepisuje předávané IP hlavičky. API potřebuje skutečnou IP pro omezení pokusů o přihlášení.
- Skutečné Expo projectId, oprávnění k notifikacím a podle nastavení projektu EXPO_ACCESS_TOKEN.

Před startem verze spusťte `npm run server:migrate`. Migrace zamykají souběžné spuštění a ověřují kontrolní součty. API a worker jsou dva samostatné procesy pod dohledem správce služeb. Worker používá databázový zámek proti souběžnému zpracování.

## Zálohy a návrat

Zálohujte celou PostgreSQL databázi včetně účtů. Použijte `pg_dump --format=custom --file=backup.dump` s připojením přes bezpečně dodané PGHOST, PGDATABASE, PGUSER a PGPASSFILE. Heslo nedávejte do historie příkazů. pg_dump musí podporovat hlavní verzi serveru.

Obnovu nacvičte do **nové prázdné izolované databáze** příkazem `pg_restore --no-owner --no-acl --dbname=restore_check backup.dump`. Ověřte přihlášení, členství, počty záznamů a synchronizaci. Nastavte denní automatické zálohy, retenci a šifrovanou kopii mimo server. Spravovaný PostgreSQL může zajišťovat průběžnou obnovu. Lokální SQLite není serverová záloha.

Při převodu služby zastavte zápisy staré aplikace a její plánovač, vytvořte export i zálohu, proveďte zkušební import a potom přepněte klienty. Po přijetí nových zápisů nelze prostým návratem ke starému backendu zachovat nové změny.

## Sledování a omezení

Sledujte /health, chyby API, doručování e-mailů, velikost databáze a neodeslané položky app.push_outbox. Po osmi neúspěšných pokusech worker přestane položku odesílat. Push potvrzuje přijetí Expo službou, nikoli doručení na telefon. Externí volání může uspět před pádem transakce; přesně jedno zobrazení notifikace není zaručeno.

Synchronizace stahuje celé snapshoty. Před rozšiřováním změřte velikost historie a latenci; samotný počet účtů neurčuje kapacitu. Při více instancích API nahraďte lokální HTTP rate limiter sdíleným omezením na proxy nebo ve společném úložišti. Limity Better Auth jsou již v databázi.

Nasazení, SMTP, fyzická zařízení, zátěž a obnovení provozní zálohy ověřte v cílovém prostředí. Lokální testy tyto kontroly nenahrazují.
