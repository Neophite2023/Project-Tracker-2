# ProjectTracker - História zmien

## 📋 Opravené chyby

### 1. **spusti_aplikaciu.vbs** - Spúšťanie URL
**Problém:** `WshShell.Run()` nespúšťa URL adresy priamo.

**Zmena:**
```vbscript
# Staré:
WshShell.Run "http://localhost:8005/desktop/", 1, False

# Nové:
WshShell.Run "explorer.exe http://localhost:8005/desktop/", 1, False
```

**Výsledok:** ✅ Aplikácia sa teraz správne otvorí v prehliadači

---

### 2. **shared/store.js** - Duplicitná proměnná
**Problém:** Deklarácia `const localProjects` sa opakovala na riadkoch 92-93, čo spôsobovalo chyby pri synchronizácii.

**Zmena:** Odstránená duplikátna deklarácia.

**Výsledok:** ✅ Synchronizácia bez chýb

---

### 3. **server.py** - Error handling
**Problém:** `send_error()` nespája správne s JSON API. Chyby na POST nepracovali správne.

**Zmeny:**
- Nahradené `send_error()` na `send_json()` pre korektné JSON odpovědi
- Pridaný `try-except` blok pre Content-Length validáciu
- Pridané loggovanie (logging modul)

**Výsledok:** ✅ Server vracia korektné JSON chyby a logy sú viditeľné

---

### 4. **shared/projects.js** - deleteTask() bez prepočtu
**Problém:** Keď zmažete úlohu, `phase.progress` sa neprekalkuluje. Stará hodnota ostáva v paměti/súbore.

**Zmena:** Pridaný prepočet `phase.progress` po zmazaní úlohy (rovnako ako v `updatePhase()`):
```javascript
// Prepočítame progres fázy keď sa zmaže úloha
if (phase.tasks && phase.tasks.length > 0) {
    const activeTasks = phase.tasks.filter(t => !t.deleted);
    if (activeTasks.length > 0) {
        const completed = activeTasks.filter(t => t.completed).length;
        phase.progress = Math.round((completed / activeTasks.length) * 100);
    } else {
        phase.progress = 0;
    }
}
```

**Výsledok:** ✅ Progress fázy sa aktualizuje ihneď po zmazaní úlohy

---

### 5. **shared/projects.js** - calculateStats() počítá so starými údajmi
**Problém:** KRITICKÉ! `calculateStats()` počítala progres z `phase.progress` v súbore namiesto zo skutočných aktívnych úloh. Zmazané úlohy s `completed: true` boli stále v prvotnom výpočte (33%).

**Zmena:** Prepísaný `calculateStats()` na prepočet priebehu PRIAMO z aktívnych úloh:
```javascript
// Pre každú fázu sa prepočítava progres z aktívnych úloh
const activeTasks = (phase.tasks || []).filter(t => !t.deleted);
let phaseProgress = 0;
if (activeTasks.length > 0) {
    const completedTasks = activeTasks.filter(t => t.completed).length;
    phaseProgress = Math.round((completedTasks / activeTasks.length) * 100);
}
```

**Výsledok:** ✅ Progress je VŽDY aktuálny, aj po zmazaní úloh. Bez splnených aktívnych úloh = 0% (nie staré 33%)

---

## 🎯 Skúšané scenáre

- ✅ Pridaj úlohu → označ ako splnú → zmažNick → progres správny (0%, nie 33%)
- ✅ Násobné úlohy s MIX splnených/nesplnených → progres správný
- ✅ Synchronizácia medzi desktopom a mobilom → bez chýb
- ✅ Server spúšťanie a restartovanie → bez portov konfliktov
- ✅ Zobrazenie v desktop aj mobile app → progres identický

---

## 📱 Dopad

| Komponenta | Dopad |
|-----------|-------|
| **desktop/app.js** | Automatické - používa shared/projects.js |
| **mobile/app.js** | Automatické - používa shared/projects.js |
| **shared/store.js** | Bez chýb pri synch |
| **server.py** | Stabilný, logguje |

---

## ✨ Status: HOTOVO

Všetky identifikované chyby sú opravené. Aplikácia beží bez problémov.

---

## Update 2026-03-22 - DB rezim a synchronizacia

### 6. `server.py` - prechod na cisty DB rezim
**Problem:** Data sa este drzali aj v `shared/data.json` (prechodne spravanie), ciel bol cisty DB rezim.

**Zmeny:**
- Odstranene citanie/zapisovanie JSON suboru `shared/data.json` zo server runtime.
- `DataStore` bezi uz iba nad `shared/data.db` (SQLite).
- `GET /api/data` cita iba z DB.
- `POST /api/data` zapisuje iba do DB a vracia `db_written` + `success`.
- Bootstrap zostal DB-first (relational + legacy DB snapshot fallback).

**Vysledok:** OK cisty DB rezim na serveri, bez JSON persistencie.

---

### 7. `mobile/app.js` - oprava okamziteho refreshu po zmazani vydavku
**Problem:** Po odstraneni vydavku sa suma a zoznam v mobile neaktualizovali vzdy hned.

**Zmena:** `deleteTransaction()` po mazani vola `this.refresh()`.

**Vysledok:** OK okamzita aktualizacia dashboardu aj detailu.

---

### 8. `mobile/index.html` + `mobile/sw.js` - cache invalidacia
**Problem:** Mobil mohol drzat starsiu verziu JS kvoli cache.

**Zmeny:**
- `app.js?v=8` -> `app.js?v=9`
- Service worker cache `tracker-v8` -> `tracker-v9`

**Vysledok:** OK nove verzie sa nacitavaju bez zastaraleho cache.

---

### 9. `desktop/js/app.js` - oprava ponuky faz pri "Pridat vydavok"
**Problem:** V selecte faz sa zobrazovali aj neaktivne/odstranene fazy, co vyzeralo ako duplicity.

**Zmeny:**
- V `showTransactionForm()` sa filtruju iba aktivne fazy (`!deleted`).
- Pridana deduplikacia podla `phase.id`.
- Ak projekt nema aktivne fazy, select je `disabled` s informacnou hlaskou.

**Vysledok:** OK ponuka faz obsahuje iba validne aktivne fazy.

---

## Smoke test (DB-only)

Spusteny end-to-end smoke test proti bezacemu serveru:
- `api/info` OK
- `api/data` read/write OK
- zapis testovacej transakcie potvrdeny v DB
- `shared/data.json` sa pri zapise nezmenil (mtime/hash bez zmeny)
- obnova povodneho stavu OK

**Vysledok:** `PASS 9/9`, `FAIL 0/9`

---

## Update 2026-03-23 - Overenie PWA a architektúry

### 10. Potvrdenie PWA (iPhone / iOS)
**Stav:** ✅ TESTOVANÉ A FUNKČNÉ
- Aplikácia spĺňa všetky požiadavky pre Apple PWA (`apple-mobile-web-app-capable`).
- Service Worker (`sw.js`) správne cacheuje assety pre offline beh.
- Ikona a standalone režim fungujú správne po pridaní na plochu.

### 11. Architektúra "Local-first"
**Princíp:**
- Primárnym zdrojom dát pre mobilnú verziu je `localStorage` v zariadení.
- Aplikácia je plne funkčná bez internetového pripojenia (offline-first).
- **Synchronizácia** s desktopovým serverom je doplnková funkcia vyvolaná manuálne používateľom.
- Konflikty sa riešia cez `updatedAt` timestampy na úrovni projektov, fáz aj úloh.

---

## ✨ Status: PROJEKT STABILNÝ

Všetky kľúčové funkcie (Desktop, Mobile PWA, Sync, SQLite DB) sú implementované a overené v reálnej prevádzke.

---

## Update 2026-04-07 - Mobile PWA: CRUD faz (parita s desktop)

### 12. `mobile/app.js` - pridavanie/uprava/zmazanie faz v detaile projektu (bottom sheet)
**Problem:** V mobile PWA chybala moznost pridat/upravit/odstranit fazu (fungovalo to len v desktop app).

**Zmeny:**
- V detaile projektu pribudlo tlacidlo **Pridat fazu** + akcie **Upravit** / **Odstranit** pri kazdej faze.
- Pridane formulare pre pridanie a upravu fazy (name, budget, expectedExtra, notes) priamo v bottom sheete.
- Po add/edit/delete sa spravi okamzity refresh karty projektu aj detailu (bez reloadu stranky).

**Vysledok:** ✅ Mobile PWA ma plnu zakladnu paritu s desktopom pre fazy (add/edit/delete).

---

### 13. `shared/projects.js` - spevnenie addPhase/addTransaction pre stare data
**Problem:** Pri starsich importoch alebo nekonzistentnych datach mohli chybat polia `project.phases` / `project.transactions`, co by zhodilo pridavanie.

**Zmeny:**
- `Projects.addPhase()` inicializuje `project.phases` na `[]`, ak to nie je pole.
- `Projects.addTransaction()` inicializuje `project.transactions` na `[]`, ak to nie je pole.

**Vysledok:** ✅ Stabilne pridavanie faz a transakcii aj pri "starych" projektoch.

---

### 14. `mobile/sw.js` + `mobile/styles.css` - PWA cache bump + ikonove tlacidla
**Problem:** Mobil mohol drzat starsiu verziu app.js (Service Worker cache) a chybali stylovane male ikonove tlacidla.

**Zmeny:**
- Service worker cache `tracker-v15` -> `tracker-v16` (nove buildy sa nacitaju korektne).
- Pridany styling pre `.m-icon-btn` (edit/delete/plus ikonky v detaile faz).

**Vysledok:** ✅ Po deployi sa mobile aktualizuje a UI akcii je konzistentne.

---

## Git

- Posledné overenie: 2026-03-23
- Verzia: 1.0.0-pwa-ready
