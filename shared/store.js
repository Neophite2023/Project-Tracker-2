const Store = {
    KEYS: {
        PROJECTS: 'projecttracker_projects',
        SETTINGS: 'projecttracker_settings'
    },
    
    serverUrl: '/api/data',
    syncInterval: null,
    lastServerTimestamp: 0,
    isSyncing: false,
    pendingSync: false,

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    getProjects() {
        try {
            const data = localStorage.getItem(this.KEYS.PROJECTS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Error parsing projects from localStorage:", e);
            return [];
        }
    },

    saveProjects(projects) {
        try {
            const newData = JSON.stringify(projects);
            const currentData = localStorage.getItem(this.KEYS.PROJECTS);
            
            if (currentData === newData) return;
            
            localStorage.setItem(this.KEYS.PROJECTS, newData);
            
            if (navigator.onLine) {
                this.pushData(true);
            }
        } catch (e) {
            console.error("Error saving projects:", e);
        }
    },

    getSettings() {
        try {
            const data = localStorage.getItem(this.KEYS.SETTINGS);
            return data ? JSON.parse(data) : { currency: '€', theme: 'light' };
        } catch (e) {
            console.error("Error parsing settings:", e);
            return { currency: '€', theme: 'light' };
        }
    },

    // --- SERVER SYNC ---

    initSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        
        // Online/offline handling
        window.addEventListener('online', () => {
            console.log("Back online, triggering sync...");
            this.triggerSync();
        });
        
        window.addEventListener('offline', () => {
            console.log("Gone offline, data will sync when back online");
            // NEUTIEKAJ syncError tu - nec kontrolluje sa online status cez listeners
        });
        
        // Pravidelny polling (kazdych 10 sekund) - VŽDY sa musí nastaviť
        this.syncInterval = setInterval(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.fetchData();
            }
        }, 10000);
        
        // Prve stiahnutie - vratime promise ak je online
        if (navigator.onLine) {
            return this.fetchData();
        } else {
            return Promise.resolve();
        }
    },
    
    triggerSync() {
        if (!navigator.onLine) {
            console.log("Offline, sync queued");
            this.pendingSync = true;
            return;
        }
        this.fetchData();
    },

    async fetchData() {
        if (this.isSyncing) return Promise.resolve();
        
        console.log("fetchData() starting...");
        this.isSyncing = true;
        window.dispatchEvent(new CustomEvent('syncStart'));
        
        try {
            console.log("Fetching from:", this.serverUrl);
            const response = await fetch(this.serverUrl);
            console.log("Fetch response status:", response.status, response.ok);
            if (!response.ok) throw new Error("Server error: " + response.status);
            
            const serverData = await response.json();
            console.log("Fetch success, server timestamp:", serverData.timestamp);
            
            // Item-level merge
            const localProjects = this.getProjects();
            const serverProjects = serverData.projects || [];
            const { merged: mergedProjects, changedProjectIds } = this.mergeProjectsWithDiff(localProjects, serverProjects);
            
            // Uložíme zmiešané dáta iba ak sa niečo zmenilo
            const newData = JSON.stringify(mergedProjects);
            const currentData = localStorage.getItem(this.KEYS.PROJECTS);
            
            if (currentData !== newData) {
                localStorage.setItem(this.KEYS.PROJECTS, newData);
                
                if (changedProjectIds.length > 0) {
                    changedProjectIds.forEach(projectId => {
                        window.dispatchEvent(new CustomEvent('projectDataChanged', { 
                            detail: { projectId } 
                        }));
                    });
                }
                
                window.dispatchEvent(new CustomEvent('projectsListChanged'));
            }
            
            // Aktualizujeme settings ak sú novšie
            if (serverData.settings) {
                const localSettingsTs = this.getSettings()._updatedAt || 0;
                const serverSettingsTs = serverData.settings._updatedAt || 0;
                if (serverSettingsTs > localSettingsTs) {
                    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(serverData.settings));
                }
            }
            
            console.log("Sync SUCCESS! Emitting syncSuccess event");
            window.dispatchEvent(new CustomEvent('syncSuccess'));
            
        } catch (e) {
            console.error("Sync FAILED:", e.message, e);
            window.dispatchEvent(new CustomEvent('syncError'));
        } finally {
            this.isSyncing = false;
        }
    },
    
    mergeProjectsWithDiff(localProjects, serverProjects) {
        const merged = [];
        const changedProjectIds = [];
        
        const localMap = new Map(localProjects.map(p => [p.id, p]));
        const serverMap = new Map(serverProjects.map(p => [p.id, p]));
        
        const allIds = new Set([...localMap.keys(), ...serverMap.keys()]);
        
        allIds.forEach(id => {
            const local = localMap.get(id);
            const server = serverMap.get(id);
            
            if (!local) {
                // Nový projekt zo servera
                merged.push({ ...server, _localVersion: false });
                changedProjectIds.push(id);
                return;
            }
            if (!server) {
                // Projekt len lokálne (napr. vytvorený v teréne)
                merged.push({ ...local, _localVersion: true });
                return;
            }

            // --- DEEP MERGE EXISTUJÚCEHO PROJEKTU ---
            const localTs = local.updatedAt || 0;
            const serverTs = server.updatedAt || 0;
            
            // Základné atribúty (názov, rozpočet) z novšej verzie
            let finalProject = serverTs > localTs ? { ...server } : { ...local };
            
            // 1. Zlúčenie fáz (Phases) - každá fáza má vlastné ID
            const phaseMap = new Map();
            const allPhases = [...(local.phases || []), ...(server.phases || [])];
            allPhases.forEach(ph => {
                const existing = phaseMap.get(ph.id);
                if (!existing) {
                    phaseMap.set(ph.id, { ...ph });
                } else {
                    // Ak fáza existuje na oboch, zlúčime jej atribúty a HLAVNE úlohy
                    const newerPhase = (ph.updatedAt || 0) > (existing.updatedAt || 0) ? ph : existing;
                    const mergedPhase = { ...newerPhase };
                    
                    // Zlúčenie úloh v rámci fázy - konzistentné rozdelenie konfliktov
                    const taskMap = new Map();
                    const allTasks = [...(existing.tasks || []), ...(ph.tasks || [])];
                    allTasks.forEach(t => {
                        const exTask = taskMap.get(t.id);
                        const tTime = t.updatedAt || 0;
                        const exTime = exTask ? (exTask.updatedAt || 0) : 0;
                        
                        if (!exTask) {
                            taskMap.set(t.id, t);
                        } else if (tTime > exTime) {
                            // Novšia verzia
                            taskMap.set(t.id, t);
                        } else if (tTime === exTime) {
                            // Zhodný timestamp - kritériá v poradí:
                            // 1. Väčšina vyhráva (ak sú obe verzie zhodné v completed, je to remíza)
                            // 2. Pri remíze použijeme ID hash pre konzistentné rozdelenie
                            if (t.completed !== exTask.completed) {
                                // Zoberieme verziu s false (nefajknutú) - bezpečnejšia voľba
                                // Alebo môžeme zobrať novšiu hodnotu podľa toho, kto je "väčší"
                                taskMap.set(t.id, t.id > exTask.id ? t : exTask);
                            } else {
                                // Úplná zhoda - konzistentné rozdelenie podľa ID
                                taskMap.set(t.id, t.id > exTask.id ? t : exTask);
                            }
                        }
                        // Ak tTime < exTime, ponecháme exTask (staršia verzia)
                    });
                    mergedPhase.tasks = Array.from(taskMap.values());
                    
                    // Prepočítame progress ak sú tam úlohy (iba active)
                    const activeTasks = mergedPhase.tasks.filter(t => !t.deleted);
                    if (activeTasks.length > 0) {
                        const completed = activeTasks.filter(t => t.completed).length;
                        mergedPhase.progress = Math.round((completed / activeTasks.length) * 100);
                    } else {
                        mergedPhase.progress = 0;
                    }

                    phaseMap.set(ph.id, mergedPhase);
                }
            });
            finalProject.phases = Array.from(phaseMap.values());

            // 2. Zlúčenie transakcií (Transactions) - Unikátne ID, spájame všetko
            const transMap = new Map();
            const allTrans = [...(local.transactions || []), ...(server.transactions || [])];
            allTrans.forEach(t => {
                const existing = transMap.get(t.id);
                // Ak existuje na oboch, ponecháme tú novšiu (pre prípad budúcich editácií)
                if (!existing || (t.updatedAt || 0) > (existing.updatedAt || 0)) {
                    transMap.set(t.id, t);
                }
            });
            finalProject.transactions = Array.from(transMap.values());

            // 3. Rekalculácia updatedAt pre projekt
            // Projekt má časovú pečiatku najnovšej zmeny spomedzi všetkých jeho častí
            finalProject.updatedAt = Math.max(localTs, serverTs);
            
            // Označíme ako zmenený, ak sa výsledný projekt líši od nášho lokálneho
            // (Použijeme JSON stringify pre hlboké porovnanie)
            if (JSON.stringify(finalProject) !== JSON.stringify(local)) {
                changedProjectIds.push(id);
            }
            
            merged.push(finalProject);
        });
        
        return { merged, changedProjectIds };
    },

    async pushData(immediate = false) {
        const projects = this.getProjects();
        const settings = this.getSettings();
        settings._updatedAt = Date.now();
        
        const payload = {
            projects,
            settings,
            timestamp: Date.now()
        };

        try {
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.timestamp) {
                    this.lastServerTimestamp = result.timestamp;
                }
                if (immediate) {
                    console.log("Immediate sync completed.");
                } else {
                    console.log("Data pushed to server successfully.");
                }
            }
        } catch (e) {
            console.error("Push failed:", e);
        }
    },

    shutdownServer() {
        // Poziadame server o vypnutie a potom zavrieme okno
        fetch('/api/shutdown', { method: 'POST' })
            .then(() => {
                alert("Server sa vypína. Aplikáciu môžete zatvoriť.");
                window.close();
            })
            .catch(e => {
                alert("Chyba pri vypínaní servera.");
                window.close();
            });
    }
};

// Export pre Node.js aj Browser
if (typeof module !== 'undefined') module.exports = Store;
else window.Store = Store;
