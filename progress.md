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
