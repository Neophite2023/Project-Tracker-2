# Ako sprevádzkovať ProjectTracker na GitHub Pages (PWA)

## 1. Nasadenie na GitHub Pages

1.  Vytvorte si nový repozitár na [GitHub.com](https://github.com/new).
2.  Nahrajte súbory tohto projektu do repozitára (celý priečinok).
3.  Prejdite do **Settings** -> **Pages**.
4.  V časti **Build and deployment** vyberte **Source**: `Deploy from a branch`.
5.  Vyberte vetvu `main` (alebo `master`) a priečinok `/ (root)`. Kliknite na **Save**.
6.  Počkajte pár minút. Vaša stránka bude dostupná na adrese: `https://VAŠE_MENO.github.io/NAZOV_REPOZITARA/`

## 2. Inštalácia na iPhone (iOS)

1.  Otvorte Safari na iPhone a prejdite na adresu mobilnej verzie:
    `https://VAŠE_MENO.github.io/NAZOV_REPOZITARA/mobile/`
2.  Kliknite na tlačidlo **Zdieľať** (štvorec so šípkou nahor).
3.  Vyberte možnosť **Pridať na plochu** (Add to Home Screen).
4.  Potvrďte názov a kliknite na **Pridať**.

## 3. Prepojenie s Desktop serverom

Keďže mobilná aplikácia beží na internete (GitHub Pages) a váš server doma na PC, musíte ich prepojiť.

### Krok A: Zistenie IP adresy PC
1.  Spustite server na PC (`spusti_server.vbs`).
2.  V okne servera uvidíte výpis, napr.:
    ```
    LAN: http://192.168.1.15:8005/
    ```
    Túto adresu si opíšte.

### Krok B: Nastavenie v mobile
1.  Otvorte aplikáciu na mobile.
2.  Kliknite na ikonu **ozubeného kolesa** (vľavo hore).
3.  Do poľa **URL ADRESA SERVERA** zadajte IP adresu z kroku A (napr. `http://192.168.1.15:8005`).
4.  Kliknite na **Uložiť**. Aplikácia sa pokúsi spojiť.

### ⚠️ Dôležité upozornenie (Mixed Content)
GitHub Pages používa zabezpečené pripojenie **HTTPS**. Váš lokálny server beží na nezabezpečenom **HTTP**.
Prehliadače (hlavne Safari) môžu blokovať toto spojenie z bezpečnostných dôvodov.

**Riešenia:**
1.  **Použite Ngrok (Odporúčané):**
    - Stiahnite si [Ngrok](https://ngrok.com/).
    - Spustite príkaz: `ngrok http 8005`
    - Získate verejnú HTTPS adresu (napr. `https://nahodne-cislo.ngrok-free.app`).
    - Túto adresu zadajte do nastavení v mobilnej aplikácii.
2.  **Povolenie v prehliadači:**
    - Na niektorých zariadeniach (Android/Chrome) sa dá vypnúť "Secure content" pre konkrétnu stránku, na iPhone je to zložitejšie.
