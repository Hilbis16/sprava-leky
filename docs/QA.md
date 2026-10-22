# Kontrola uživatelských postupů

Ověřeno 22. 10. 2026 v izolovaném Chrome nad webovým exportem aplikace. Mobilní viewport 390 × 844 a desktop 1440 × 844; vybrané obrazovky byly také vizuálně zkontrolované ze snímků. API běželo pouze na localhost proti vlastnímu dočasnému PostgreSQL. Použity byly výhradně syntetické účty `@example.test`; přihlašovací zprávy zachytávala testovací funkce bez skutečného odesílání.

## Výsledky

| Postup | Výsledek |
| --- | --- |
| Přihlášení | Chybný kód se odmítne, platný přihlásí. Nový účet obsahuje prázdný stav, žádné ukázkové léky. |
| Osoba a kontakt | Přidání osoby a lékaře přes formuláře; změny prošly API a fronta se vyprázdnila. Přepnutí spravované osoby změnilo rozvrh i historii. |
| Lék | Vytvoření, následná změna názvu, balení, času a konce kúry; ověřen uložený stav. Samostatně ověřen přenos léku na předpis do PostgreSQL. |
| Neplatné vstupy | Prázdné jméno nevytvořilo osobu. `1e309` neprošlo na další krok ani do přepočtu zásob. `30,5` se uložilo jako 30.5. Po opravě znovu ověřeny skutečné dialogy s důvodem odmítnutí prázdného jména a `1e309`; opravený formulář se následně uložil a synchronizoval. |
| Dávky a historie | Potvrzení i vrácení potvrzení aktualizuje přehled. Výběr dnů v historii funguje, potvrzená dávka se objeví v denním i souhrnném pohledu. |
| Zásoby | Doplnění balení zapíše inventurní událost. Platný přepočet na `12,5` uzavře formulář a ukáže odpovídající zásobu. |
| Senior a PIN | Otevření režimu, potvrzení dávky, odmítnutí chybného PINu a odchod se správným PINem prošly na webu. |
| Žádost o recept | Návrh i ruční přechody připraveno → odesláno → vyřízeno se synchronizovaly. Zrušení systémového sdílení bylo simulované; žádná zpráva nebyla skutečně odeslána. |
| Offline | Při skutečné emulaci odpojení v prohlížeči zůstalo potvrzení dávky uložené ve frontě. Po obnovení připojení a ruční synchronizaci se fronta vyprázdnila a potvrzení zachovalo. |
| Oddělení účtů | Druhý účet neukázal rodinu ani léky prvního. Po návratu k prvnímu účtu i obnovení stránky zůstala jeho data a potvrzení dostupná. |
| Pozvánka | Přes UI vznikla pozvánka a zobrazil se QR dialog. Samostatná testovací pozvánka vznikla přímo přes API; druhý účet ji přijal přes UI a uviděl sdílená data. Opakovaný pokus dostal HTTP 400. Skenování mezi telefony nebylo provedeno. |
| Rozložení | Prohlédnuty mobilní obrazovky dneška, rodiny, seniora a historie i desktopový dnešek. Kontrolované viewporty neměly vodorovný přesah. |

## Opravený nález: neviditelné zprávy na webu

Původní formuláře používaly `Alert.alert` z React Native, ale instalovaný `react-native-web` implementuje `Alert.alert()` jako prázdnou funkci. Po stisku „Pokračovat“ s počtem kusů `1e309` zůstával uživatel ve druhém kroku bez vysvětlení. Stejně se chovalo prázdné jméno nové osoby.

Opraveno 22. 10.: obrazovky a stav aplikace používají společné `showMessage`, na webu dialog prohlížeče a na telefonu nativní dialog. Otázka po odeslání žádosti používá `confirmAction`, takže odpověď skutečně řídí označení žádosti. Prohlížeč při regresním průchodu vyvolal dialogy „Jméno osoby je povinný údaj.“ a „Zadejte konečný počet kusů.“; formuláře zůstaly otevřené a opravený vstup se následně uložil.

## Opravený nález: stav po odmítnuté pozvánce

Po opakovaném přijetí již použité pozvánky API správně vracelo HTTP 400, ale přehled dále ukazoval „Připojuji rodinu…“. Původní akce tento text při výjimce neobnovila.

Opraveno 22. 10.: `src/state/acceptInvite.ts` ověří předběžné podmínky před zahájením operace, při chybě nastaví dokončený chybový stav a předá původní výjimku obrazovce. Prohlížeč proti novému dočasnému PostgreSQL ověřil výpadek sítě, následné úspěšné opakování a HTTP 400 při dalším použití odkazu. Dialog ukázal důvod odmítnutí a rodinný přehled poté zobrazoval „Připojení rodiny se nepodařilo dokončit.“. Jednotkové testy navíc pokrývají neodeslané změny, změny během přenosu a selhání lokálního zápisu.

## Omezení a podklady

- Uživatel potvrdil, že teď nemá telefon k testování. OCR, skutečné doručení lokálních/push notifikací, chování OS a nativní PIN proto zůstávají neověřené. Postup je v [DEVELOPMENT.md](DEVELOPMENT.md).
- Nebylo ověřeno skutečné SMTP, doručení SMS/e-mailu žádosti, systémové sdílení ani skenování QR druhým telefonem. Dočasné API není nasazení služby.
- Pro test webové pozvánky dočasný statický server mapoval `/invite/<token>` na export `dist/invite/[token].html`; tím se neměnila aplikační logika. Odkaz ani přihlašovací kódy se nezapisovaly do výsledků.
- Lokální podklady jsou v `.cache/ui-review/` a `.cache/ui-review-log.jsonl`; pomocné QA procesy a skripty nejsou součástí produktu. Testovací skripty používají reálné formuláře, klikání a zadávání textu přes prohlížeč; nepřepisují interní stav Reactu.
- Po opravě obou nálezů prošlo **90 klientských a 14 serverových testů**, obě typové kontroly, ESLint a nový webový export. Mobilní chování dialogů v testech používá simulaci; skutečný telefon zatím nebyl dostupný.
