const App = {
    currentPage: 'dashboard',
    currentProjectId: null,

    init() {
        // Počká na prvú synchronizáciu pred renderovaním
        const syncPromise = Store.initSync();
        
        if (syncPromise && syncPromise.then) {
            syncPromise.then(() => {
                this.navigate('dashboard');
            }).catch(() => {
                this.navigate('dashboard');
            });
        } else {
            this.navigate('dashboard');
        }
        
        this.setupStatusIndicator();
        this.setupSheetGestures();
        this.setupDataListeners();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered!', reg))
                .catch(err => console.log('SW failed', err));
        }
    },
    
    setupDataListeners() {
        window.addEventListener('projectDataChanged', (e) => {
            if (this.currentPage === 'dashboard') {
                this.refreshProjectCard(e.detail.projectId);
            }
            if (this.currentProjectId === e.detail.projectId && this.currentPage === 'dashboard') {
                this.showProjectDetail(e.detail.projectId);
            }
        });
        
        window.addEventListener('projectsListChanged', () => {
            if (this.currentPage === 'dashboard' || this.currentPage === 'projects') {
                this.refresh();
            }
        });
    },
    
    refreshProjectCard(projectId) {
        const card = document.querySelector(`[data-project-id="${projectId}"]`);
        if (!card) return;
        
        const project = Projects.get(projectId);
        if (!project) return;
        
        const stats = Projects.calculateStats(project);
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <div>
                    <div class="m-project-title">${project.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${project.type.toUpperCase()}</div>
                </div>
                <span class="m-badge">${stats.progress}%</span>
            </div>
            <div style="font-size: 0.9rem; font-weight: 700;">
                ${stats.totalSpent.toLocaleString()} € <span style="font-weight: 400; color: var(--text-muted);">z ${stats.totalBudget.toLocaleString()} €</span>
            </div>
        `;
    },

    setupSheetGestures() {
        const sheet = document.getElementById('bottomSheet');
        const overlay = document.getElementById('overlay');
        const handle = document.querySelector('.sheet-handle');
        
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let startTime = 0;

        // Zatvorenie kliknutím na úchytku
        handle.addEventListener('click', () => this.hideSheet());

        const onTouchStart = (e) => {
            // Reagujeme len ak sme na začiatku scrollovania obsahu
            if (sheet.scrollTop <= 0) {
                startY = e.touches[0].clientY;
                startTime = Date.now();
                isDragging = true;
                sheet.style.transition = 'none';
                overlay.style.transition = 'none';
            }
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;

            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;

            if (deltaY > 0) {
                // Zabránime defaultnému správaniu (scrollovaniu)
                if (e.cancelable) e.preventDefault();
                
                sheet.style.transform = `translateY(${deltaY}px)`;
                
                // Plynulé blednutie overlayu (max 0.5 opacity)
                const opacity = Math.max(0, 0.5 - (deltaY / sheet.offsetHeight));
                overlay.style.backgroundColor = `rgba(0,0,0,${opacity})`;
            } else {
                // Ak ťaháme hore, resetujeme (nechceme aby okno vyletelo hore)
                isDragging = false;
                sheet.style.transform = 'translateY(0)';
            }
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;

            const deltaY = currentY - startY;
            const deltaTime = Date.now() - startTime;
            const velocity = deltaY / deltaTime; // Rýchlosť pohybu

            sheet.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
            overlay.style.transition = 'background-color 0.3s ease';

            // Ak sme potiahli viac ako 150px ALEBO ak sme urobili rýchly švih (velocity > 0.5)
            if (deltaY > 150 || (velocity > 0.5 && deltaY > 20)) {
                this.hideSheet();
            } else {
                sheet.style.transform = 'translateY(0)';
                overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
            }
        };

        // Listenery pridáme na celé okno
        sheet.addEventListener('touchstart', onTouchStart, { passive: false });
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    },

    setupStatusIndicator() {
        const el = document.getElementById('connectionStatus');
        const syncIcon = document.getElementById('syncIcon');
        const lastSyncEl = document.getElementById('lastSync');
        let lastSyncTime = null;
        
        const updateStatus = (online) => {
            if (online) {
                el.style.color = '#10b981';
                el.innerHTML = '<span style="display: block; width: 6px; height: 6px; background: #10b981; border-radius: 50%;"></span> Online';
            } else {
                el.style.color = '#ef4444';
                el.innerHTML = '<span style="display: block; width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></span> Offline';
            }
        };
        
        const formatLastSync = () => {
            if (!lastSyncTime) return 'Nikdy';
            const diff = Math.floor((Date.now() - lastSyncTime) / 1000);
            if (diff < 60) return 'Práve teraz';
            if (diff < 3600) return `Pred ${Math.floor(diff/60)}m`;
            return `Pred ${Math.floor(diff/3600)}h`;
        };

        window.addEventListener('syncSuccess', () => {
            updateStatus(true);
            lastSyncTime = Date.now();
            lastSyncEl.textContent = formatLastSync();
            if (syncIcon) {
                syncIcon.classList.remove('fa-spin');
            }
        });
        window.addEventListener('syncError', () => {
            updateStatus(false);
            if (syncIcon) {
                syncIcon.classList.remove('fa-spin');
            }
        });
        
        window.addEventListener('syncStart', () => {
            if (syncIcon) {
                syncIcon.classList.add('fa-spin');
            }
        });
        
        // Update last sync time periodically
        setInterval(() => {
            if (lastSyncTime) {
                lastSyncEl.textContent = formatLastSync();
            }
        }, 60000);
        
        // Initial status
        updateStatus(navigator.onLine);
    },

    navigate(page) {
        this.currentPage = page;
        
        // Update Bottom Nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        const titles = {
            'dashboard': 'Prehľad',
            'add': 'Pridať výdavok',
            'projects': 'Zoznam projektov'
        };
        document.getElementById('mobileTitle').textContent = titles[page] || 'Tracker';

        this.render();
    },

    refresh() {
        this.render();
        
        // Ak je otvoreny detail projektu, aktualizujeme aj ten
        const sheet = document.getElementById('bottomSheet');
        if (sheet.classList.contains('active') && this.currentProjectId) {
            console.log("Live updating open project detail:", this.currentProjectId);
            this.showProjectDetail(this.currentProjectId);
        }
    },

    render() {
        const area = document.getElementById('mainArea');
        area.innerHTML = '';

        if (this.currentPage === 'dashboard') this.renderDashboard(area);
        else if (this.currentPage === 'add') this.renderAdd(area);
        else if (this.currentPage === 'projects') this.renderProjects(area);
    },

    // --- DASHBOARD ---
    renderDashboard(container) {
        const projects = Projects.getAll();
        const stats = projects.map(p => Projects.calculateStats(p));
        const totalBudget = stats.reduce((sum, s) => sum + s.totalBudget, 0);
        const totalSpent = stats.reduce((sum, s) => sum + s.totalSpent, 0);

        container.innerHTML = `
            <div class="m-card" style="background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: white;">
                <div style="opacity: 0.8; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Celkový rozpočet</div>
                <div style="font-size: 2rem; font-weight: 800; margin-bottom: 1rem;">${totalSpent.toLocaleString()} / ${totalBudget.toLocaleString()} €</div>
                <div style="height: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${totalBudget > 0 ? (totalSpent/totalBudget)*100 : 0}%; height: 100%; background: white;"></div>
                </div>
            </div>

            <h3 style="margin: 1.5rem 0 1rem; font-weight: 800;">Aktuálne projekty</h3>
            ${projects.length ? projects.map(p => this.createProjectCard(p)).join('') : '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Žiadne projekty.</p>'}
        `;
    },

    createProjectCard(p) {
        const stats = Projects.calculateStats(p);
        return `
            <div class="m-card" onclick="App.showProjectDetail('${p.id}')" data-project-id="${p.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                    <div>
                        <div class="m-project-title">${p.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${p.type.toUpperCase()}</div>
                    </div>
                    <span class="m-badge">${stats.progress}%</span>
                </div>
                <div style="font-size: 0.9rem; font-weight: 700;">
                    ${stats.totalSpent.toLocaleString()} € <span style="font-weight: 400; color: var(--text-muted);">z ${stats.totalBudget.toLocaleString()} €</span>
                </div>
            </div>
        `;
    },

    // --- PROJECT DETAIL (BOTTOM SHEET) ---
    showProjectDetail(id) {
        const project = Projects.get(id);
        if (!project) return;
        this.currentProjectId = id; // Ulozime si ID pre refresh
        const stats = Projects.calculateStats(project);

        const content = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 style="font-weight: 800;">${project.name}</h2>
                <span class="m-badge">${stats.progress}%</span>
            </div>
            
            <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.9rem;">${project.description || 'Bez popisu'}</p>

            <h4 style="margin-bottom: 1rem; font-weight: 800;">Fázy a úlohy</h4>
            ${stats.phaseStats.map(ph => `
                <div class="m-phase" data-phase-id="${ph.id}">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-weight: 700; font-size: 0.9rem;">
                        <span>${ph.name}</span>
                        <span style="color: ${ph.isOverBudget ? '#ef4444' : 'var(--primary)'}">${ph.progress}%</span>
                    </div>
                    <div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-bottom: 1rem;">
                        <div style="width: ${ph.progress}%; height: 100%; background: var(--primary);"></div>
                    </div>
                    <div class="m-tasks">
                        ${(ph.tasks || []).map(t => `
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <label class="m-task" style="margin-bottom: 0; flex: 1; display: flex; align-items: center; gap: 0.5rem;">
                                    <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="App.toggleTask('${project.id}', '${ph.id}', '${t.id}')">
                                    <span style="flex: 1; ${t.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${t.text}</span>
                                </label>
                                <button onclick="App.deleteTask('${project.id}', '${ph.id}', '${t.id}')" style="background: none; border: none; color: #d1d5db; cursor: pointer; padding: 0.5rem; font-size: 1rem;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <input type="text" id="nt-${ph.id}" placeholder="Nová úloha..." class="m-input" style="margin-bottom: 0; font-size: 0.9rem; padding: 0.5rem;">
                        <button onclick="App.addTask('${project.id}', '${ph.id}')" class="m-btn" style="width: auto; padding: 0 1rem; margin-top: 0;">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        `;

        document.getElementById('sheetContent').innerHTML = content;
        this.showSheet();
    },

    addTask(projectId, phaseId) {
        const input = document.getElementById(`nt-${phaseId}`);
        const text = input.value.trim();
        if (!text) return;
        
        Projects.addTask(projectId, phaseId, text);
        input.value = ''; // Vymaž input
        
        // Aktualizuj obsah bez zavretia/otvárania okna
        const project = Projects.get(projectId);
        if (project) {
            const stats = Projects.calculateStats(project);
            const phaseStats = stats.phaseStats;
            const ph = phaseStats.find(p => p.id === phaseId);
            
            if (ph) {
                const tasksHtml = (ph.tasks || []).map(t => `
                    <label class="m-task">
                        <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="App.toggleTask('${projectId}', '${phaseId}', '${t.id}')">
                        <span style="${t.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${t.text}</span>
                    </label>
                `).join('');
                
                // Nájdi prvok s úlohami a aktualizuj
                const tasksContainer = document.querySelector(`[data-phase-id="${phaseId}"] .m-tasks`);
                if (tasksContainer) {
                    tasksContainer.innerHTML = tasksHtml;
                }
            }
        }
    },

    deleteTask(projectId, phaseId, taskId) {
        Projects.deleteTask(projectId, phaseId, taskId);
        
        // Aktualizuj obsah bez zavretia/otvárania okna
        const project = Projects.get(projectId);
        if (project) {
            const stats = Projects.calculateStats(project);
            const phaseStats = stats.phaseStats;
            const ph = phaseStats.find(p => p.id === phaseId);
            
            if (ph) {
                const tasksHtml = (ph.tasks || []).map(t => `
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <label class="m-task" style="margin-bottom: 0; flex: 1; display: flex; align-items: center; gap: 0.5rem;">
                            <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="App.toggleTask('${projectId}', '${phaseId}', '${t.id}')">
                            <span style="flex: 1; ${t.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${t.text}</span>
                        </label>
                        <button onclick="App.deleteTask('${projectId}', '${phaseId}', '${t.id}')" style="background: none; border: none; color: #d1d5db; cursor: pointer; padding: 0.5rem; font-size: 1rem;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('');
                
                // Nájdi prvok s úlohami a aktualizuj
                const tasksContainer = document.querySelector(`[data-phase-id="${phaseId}"] .m-tasks`);
                if (tasksContainer) {
                    tasksContainer.innerHTML = tasksHtml;
                }
            }
        }
    },

    // --- ADD TRANSACTION ---
    renderAdd(container) {
        const projects = Projects.getAll();
        if (!projects.length) return container.innerHTML = '<p style="text-align:center;padding:2rem;">Najprv vytvorte projekt v PC.</p>';

        container.innerHTML = `
            <div class="m-card">
                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">PROJEKT</label>
                <select id="m_project" class="m-input" onchange="App.updatePhaseSelect(this.value)">
                    <option value="">-- Vyber projekt --</option>
                    ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">FÁZA</label>
                <select id="m_phase" class="m-input">
                    <option value="">-- Najprv vyber projekt --</option>
                </select>

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">KATEGÓRIA</label>
                <select id="m_category" class="m-input">
                    <option value="material">🧱 Materiál</option>
                    <option value="labor">🛠️ Práca / Služby</option>
                    <option value="transport">🚚 Doprava</option>
                    <option value="other">📦 Iné</option>
                </select>

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">SUMA (€)</label>
                <input type="number" id="m_amount" class="m-input" placeholder="0.00" inputmode="decimal">

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">POPIS</label>
                <input type="text" id="m_desc" class="m-input" placeholder="napr. Cement 10ks">

                <button class="m-btn" onclick="App.saveTransaction()" style="margin-top: 1rem;">
                    <i class="fas fa-check-circle"></i> Uložiť výdavok
                </button>
            </div>
        `;
    },

    updatePhaseSelect(projectId) {
        const project = Projects.get(projectId);
        const select = document.getElementById('m_phase');
        if (!project) return select.innerHTML = '<option value="">-- Vyber projekt --</option>';
        select.innerHTML = project.phases.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    },

    saveTransaction() {
        const pid = document.getElementById('m_project').value;
        const phid = document.getElementById('m_phase').value;
        const cat = document.getElementById('m_category').value;
        const amount = document.getElementById('m_amount').value;
        const desc = document.getElementById('m_desc').value;

        if (!pid || !phid || !amount) return alert("Chýba suma alebo fáza!");

        Projects.addTransaction(pid, phid, amount, desc, cat);
        alert("Hotovo! ✅");
        this.navigate('dashboard');
    },

    // --- ACTIONS ---
    toggleTask(projectId, phaseId, taskId) {
        Projects.toggleTask(projectId, phaseId, taskId);
        // Refresh detailu (sheetu) ak je otvorený
        this.showProjectDetail(projectId);
    },

    // --- SHEET UI ---
    showSheet() {
        const sheet = document.getElementById('bottomSheet');
        sheet.style.transform = 'translateY(0)';
        sheet.classList.add('active');
        document.getElementById('overlay').classList.add('active');
    },

    hideSheet() {
        const sheet = document.getElementById('bottomSheet');
        const overlay = document.getElementById('overlay');
        
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
        sheet.style.transform = 'translateY(100%)';
        
        overlay.style.transition = 'background-color 0.3s ease';
        overlay.style.backgroundColor = 'rgba(0,0,0,0)';

        setTimeout(() => {
            sheet.classList.remove('active');
            overlay.classList.remove('active');
            // Reset štýlov pre ďalšie otvorenie
            sheet.style.transform = '';
            overlay.style.backgroundColor = '';
        }, 300);
    },

    renderProjects(container) {
        const projects = Projects.getAll();
        container.innerHTML = `
            <h3 style="margin-bottom: 1rem; font-weight: 800;">Všetky projekty</h3>
            ${projects.map(p => this.createProjectCard(p)).join('')}
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
