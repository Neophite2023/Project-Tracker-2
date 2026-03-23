const Store = {
    KEYS: {
        PROJECTS: 'projecttracker_projects',
        SETTINGS: 'projecttracker_settings',
        PENDING_SYNC: 'projecttracker_pending_sync',
        SYNC_BASE_URL: 'projecttracker_sync_base_url'
    },

    runtimeMode: 'desktop',
    syncInterval: null,
    syncIntervalMs: 2000,
    requestTimeoutMs: 3000,
    isSyncing: false,
    pendingSync: false,
    listenersBound: false,
    syncBaseUrl: '',
    lastServerTimestamp: 0,
    lastSyncErrorReason: '',

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
            this.setPendingSync(true);

            // Desktop keeps auto sync; mobile uses manual sync button.
            if (this.runtimeMode === 'desktop' && navigator.onLine) {
                this.triggerSync();
            }
        } catch (e) {
            console.error("Error saving projects:", e);
        }
    },

    getSettings() {
        try {
            const data = localStorage.getItem(this.KEYS.SETTINGS);
            return data ? JSON.parse(data) : { currency: 'EUR', theme: 'light' };
        } catch (e) {
            console.error("Error parsing settings:", e);
            return { currency: 'EUR', theme: 'light' };
        }
    },

    getPendingSync() {
        try {
            return localStorage.getItem(this.KEYS.PENDING_SYNC) === '1';
        } catch (e) {
            console.error("Error reading pending sync flag:", e);
            return this.pendingSync;
        }
    },

    setPendingSync(value) {
        this.pendingSync = !!value;
        try {
            if (this.pendingSync) localStorage.setItem(this.KEYS.PENDING_SYNC, '1');
            else localStorage.removeItem(this.KEYS.PENDING_SYNC);
        } catch (e) {
            console.error("Error writing pending sync flag:", e);
        }
    },

    getStoredSyncBaseUrl() {
        try {
            return localStorage.getItem(this.KEYS.SYNC_BASE_URL) || '';
        } catch (e) {
            console.error("Error reading sync base URL:", e);
            return '';
        }
    },

    getSyncBaseUrl() {
        const current = this.syncBaseUrl || this.getStoredSyncBaseUrl();
        // Zmenené na true, aby sme akceptovali HTTP aj pri načítaní uloženej adresy
        const normalized = this.normalizeSyncBaseUrl(current, true);
        if (!normalized) return '';
        this.syncBaseUrl = normalized;
        return normalized;
    },

    normalizeSyncBaseUrl(value, allowHttp = false) {
        if (!value) return '';
        try {
            const url = new URL(String(value).trim());
            if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
                return '';
            }
            const pathname = (url.pathname || '').replace(/\/+$/, '');
            return `${url.protocol}//${url.host}${pathname}`;
        } catch (e) {
            return '';
        }
    },

    setSyncBaseUrl(value, persist = true) {
        // Zmenené na true, aby sme povolili HTTP v lokálnej sieti
        const normalized = this.normalizeSyncBaseUrl(value, true);
        if (!normalized) return false;
        this.syncBaseUrl = normalized;
        if (persist) {
            try {
                localStorage.setItem(this.KEYS.SYNC_BASE_URL, normalized);
            } catch (e) {
                console.error("Error persisting sync base URL:", e);
            }
        }
        return true;
    },

    bootstrapSyncBaseFromLocation() {
        if (typeof window === 'undefined') return;

        let appliedFromQuery = false;
        try {
            const currentUrl = new URL(window.location.href);
            const syncParam = currentUrl.searchParams.get('sync');
            if (syncParam) {
                // Zmenené na true, aby sme povolili HTTP z URL parametra
                appliedFromQuery = this.setSyncBaseUrl(syncParam, true);
                currentUrl.searchParams.delete('sync');
                if (window.history && window.history.replaceState) {
                    const cleanUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
                    window.history.replaceState({}, document.title, cleanUrl);
                }
            }
        } catch (e) {
            console.error("Failed to bootstrap sync base from URL:", e);
        }

        if (!appliedFromQuery) {
            const stored = this.getStoredSyncBaseUrl();
            // Zmenené na true pre povolenie uloženej HTTP adresy
            const normalizedStored = this.normalizeSyncBaseUrl(stored, true);
            if (normalizedStored) {
                this.syncBaseUrl = normalizedStored;
            } else if (stored) {
                try {
                    localStorage.removeItem(this.KEYS.SYNC_BASE_URL);
                } catch (e) {
                    console.error("Error clearing invalid sync base URL:", e);
                }
            }
        }
    },

    resolveApiUrl(path) {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        if (this.runtimeMode === 'mobile' && this.syncBaseUrl) {
            return `${this.syncBaseUrl}${normalizedPath}`;
        }
        return normalizedPath;
    },

    setLastSyncError(reason = '') {
        this.lastSyncErrorReason = reason || '';
    },

    emitSyncError(reason = '') {
        this.setLastSyncError(reason);
        window.dispatchEvent(new CustomEvent('syncError', { detail: { reason } }));
    },

    initSync(options = {}) {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = null;

        this.runtimeMode = options.runtimeMode || this.runtimeMode || 'desktop';
        this.pendingSync = this.getPendingSync();

        if (this.runtimeMode === 'mobile') {
            this.bootstrapSyncBaseFromLocation();
        } else {
            this.syncBaseUrl = '';
        }

        if (!this.listenersBound) {
            window.addEventListener('online', () => {
                if (this.runtimeMode === 'desktop') this.triggerSync();
            });
            window.addEventListener('offline', () => {
                console.log("Offline mode active");
            });
            this.listenersBound = true;
        }

        if (this.runtimeMode === 'desktop') {
            this.syncInterval = setInterval(() => {
                if (navigator.onLine && !this.isSyncing) this.triggerSync();
            }, this.syncIntervalMs);
            if (navigator.onLine) return this.triggerSync();
        }
        return Promise.resolve();
    },

    triggerSync() {
        return this.manualSyncNow();
    },

    async fetchWithTimeout(url, options = {}, timeoutMs = this.requestTimeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    },

    getManualSyncPrecheckError() {
        if (!navigator.onLine) return 'Zariadenie je offline.';
        if (this.runtimeMode === 'mobile') {
            if (!this.syncBaseUrl) return 'Sync endpoint nie je nastaveny.';
            // Dočasne vypnuté pre testovanie cez lokálnu sieť bez HTTPS
            // if (this.syncBaseUrl.startsWith('http://')) {
            //     return 'Sync endpoint musi byt HTTPS.';
            // }
        }
        return '';
    },

    normalizeSyncError(error) {
        const rawMessage = (error && error.message) ? String(error.message) : String(error || '');
        const lower = rawMessage.toLowerCase();

        if (error && error.name === 'AbortError') {
            return 'Server neodpoveda (timeout).';
        }
        if (lower.includes('ssl') || lower.includes('tls') || lower.includes('cert')) {
            return 'HTTPS/certifikat problem pri pripojeni.';
        }
        if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
            if (this.runtimeMode === 'mobile' && this.syncBaseUrl) {
                return 'Server je nedostupny alebo je problem s HTTPS certifikatom.';
            }
            return 'Server je nedostupny.';
        }
        return rawMessage || 'Synchronizacia zlyhala.';
    },

    async manualSyncNow() {
        if (this.isSyncing) {
            return { success: false, reason: 'Synchronizacia uz prebieha.' };
        }

        const precheckReason = this.getManualSyncPrecheckError();
        if (precheckReason) {
            this.emitSyncError(precheckReason);
            return { success: false, reason: precheckReason };
        }

        this.isSyncing = true;
        window.dispatchEvent(new CustomEvent('syncStart'));

        try {
            // 1) Health check
            const infoUrl = this.resolveApiUrl('/api/info');
            const infoResp = await this.fetchWithTimeout(infoUrl, {}, 2500);
            if (!infoResp.ok) throw new Error(`Server info error: ${infoResp.status}`);
            await infoResp.json();

            // 2) Push pending local changes first
            if (this.getPendingSync()) {
                const pushed = await this.pushData(true);
                if (!pushed) throw new Error('Nepodarilo sa odoslat lokalne zmeny.');
            }

            // 3) Pull + merge
            const dataUrl = this.resolveApiUrl('/api/data');
            const response = await this.fetchWithTimeout(dataUrl);
            if (!response.ok) throw new Error(`Server data error: ${response.status}`);

            const serverData = await response.json();
            const localProjects = this.getProjects();
            const serverProjects = serverData.projects || [];
            const { merged: mergedProjects, changedProjectIds } = this.mergeProjectsWithDiff(localProjects, serverProjects);
            const shouldPushProjects = JSON.stringify(mergedProjects) !== JSON.stringify(serverProjects);

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

            const localSettings = this.getSettings();
            const localSettingsTs = Number(localSettings._updatedAt || 0);
            const hasLocalSettings = !!localStorage.getItem(this.KEYS.SETTINGS);
            const serverSettingsTs = Number((serverData.settings && serverData.settings._updatedAt) || 0);
            let shouldPushSettings = false;

            if (serverData.settings) {
                if (serverSettingsTs > localSettingsTs) {
                    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(serverData.settings));
                } else if (localSettingsTs > serverSettingsTs) {
                    shouldPushSettings = true;
                }
            } else if (hasLocalSettings) {
                shouldPushSettings = true;
            }

            // 4) Final push if local won merge
            if (shouldPushProjects || shouldPushSettings || this.getPendingSync()) {
                const pushedAgain = await this.pushData(true);
                if (!pushedAgain) throw new Error('Nepodarilo sa dokoncit finalny push.');
            }

            this.setLastSyncError('');
            window.dispatchEvent(new CustomEvent('syncSuccess'));
            return { success: true };
        } catch (e) {
            const reason = this.normalizeSyncError(e);
            this.emitSyncError(reason);
            console.error("Manual sync failed:", e);
            return { success: false, reason };
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
                merged.push({ ...server, _localVersion: false });
                changedProjectIds.push(id);
                return;
            }
            if (!server) {
                merged.push({ ...local, _localVersion: true });
                return;
            }

            const localTs = local.updatedAt || 0;
            const serverTs = server.updatedAt || 0;
            const finalProject = serverTs > localTs ? { ...server } : { ...local };

            const phaseMap = new Map();
            const allPhases = [...(local.phases || []), ...(server.phases || [])];
            allPhases.forEach(ph => {
                const existing = phaseMap.get(ph.id);
                if (!existing) {
                    phaseMap.set(ph.id, { ...ph });
                } else {
                    const newerPhase = (ph.updatedAt || 0) > (existing.updatedAt || 0) ? ph : existing;
                    const mergedPhase = { ...newerPhase };

                    const taskMap = new Map();
                    const allTasks = [...(existing.tasks || []), ...(ph.tasks || [])];
                    allTasks.forEach(t => {
                        const exTask = taskMap.get(t.id);
                        const tTime = t.updatedAt || 0;
                        const exTime = exTask ? (exTask.updatedAt || 0) : 0;

                        if (!exTask) {
                            taskMap.set(t.id, t);
                        } else if (tTime > exTime) {
                            taskMap.set(t.id, t);
                        } else if (tTime === exTime) {
                            if (t.completed !== exTask.completed) {
                                taskMap.set(t.id, t.completed === false ? t : exTask);
                            } else if (!!t.deleted !== !!exTask.deleted) {
                                taskMap.set(t.id, t.deleted ? exTask : t);
                            } else {
                                taskMap.set(t.id, exTask);
                            }
                        }
                    });
                    mergedPhase.tasks = Array.from(taskMap.values());

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

            const transMap = new Map();
            const allTrans = [...(local.transactions || []), ...(server.transactions || [])];
            allTrans.forEach(t => {
                const existing = transMap.get(t.id);
                if (!existing || (t.updatedAt || 0) > (existing.updatedAt || 0)) {
                    transMap.set(t.id, t);
                }
            });
            finalProject.transactions = Array.from(transMap.values());
            finalProject.updatedAt = Math.max(localTs, serverTs);

            if (JSON.stringify(finalProject) !== JSON.stringify(local)) {
                changedProjectIds.push(id);
            }
            merged.push(finalProject);
        });

        return { merged, changedProjectIds };
    },

    async pushData(immediate = false) {
        const projects = this.getProjects();
        const settings = { ...this.getSettings() };
        if (!settings._updatedAt) settings._updatedAt = Date.now();

        const payload = {
            projects,
            settings,
            timestamp: Date.now()
        };

        try {
            const dataUrl = this.resolveApiUrl('/api/data');
            const response = await this.fetchWithTimeout(dataUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Server error: " + response.status);
            const result = await response.json();
            if (result.timestamp) this.lastServerTimestamp = result.timestamp;

            this.setPendingSync(false);
            if (immediate) console.log("Sync push completed.");
            return true;
        } catch (e) {
            this.setPendingSync(true);
            console.error("Push failed:", e);
            return false;
        }
    },

    shutdownServer() {
        const shutdownUrl = this.resolveApiUrl('/api/shutdown');
        this.fetchWithTimeout(shutdownUrl, { method: 'POST' }, 2500)
            .then(() => {
                alert("Server sa vypina. Aplikaciu mozete zatvorit.");
                window.close();
            })
            .catch(() => {
                alert("Chyba pri vypinani servera.");
                window.close();
            });
    },

    exportData() {
        return JSON.stringify({
            projects: this.getProjects(),
            settings: this.getSettings(),
            timestamp: Date.now()
        });
    },

    mergeData(data) {
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            const incomingProjects = (parsed && parsed.projects) || [];
            const incomingSettings = (parsed && parsed.settings) || null;

            const localProjects = this.getProjects();
            const { merged, changedProjectIds } = this.mergeProjectsWithDiff(localProjects, incomingProjects);
            localStorage.setItem(this.KEYS.PROJECTS, JSON.stringify(merged));

            if (incomingSettings) {
                const localSettings = this.getSettings();
                const localTs = Number(localSettings._updatedAt || 0);
                const incomingTs = Number(incomingSettings._updatedAt || 0);
                if (incomingTs >= localTs) {
                    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(incomingSettings));
                }
            }

            this.setPendingSync(true);
            if (navigator.onLine && this.runtimeMode === 'desktop') {
                this.triggerSync();
            }

            return { success: true, newItems: changedProjectIds.length };
        } catch (e) {
            return { success: false, error: e.message || String(e), newItems: 0 };
        }
    }
};

if (typeof module !== 'undefined') module.exports = Store;
else window.Store = Store;
