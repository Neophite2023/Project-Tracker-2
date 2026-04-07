const App = {
    currentPage: 'dashboard',
    currentProjectId: null,
    pendingExpenseProjectId: null,
    pendingExpensePhaseId: null,

    init() {
        // Počká na prvú synchronizáciu pred renderovaním
        const syncPromise = Store.initSync({ runtimeMode: 'mobile' });
        
        // Inicializuj status indikátor, event listeners a gestures HNEĎ
        this.setupStatusIndicator();
        this.setupSheetGestures();
        this.setupDataListeners();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered!', reg))
                .catch(err => console.log('SW failed', err));
        }
        
        // Teraz počka na prvú synchronizáciu
        this.navigate('dashboard');

        if (syncPromise && syncPromise.then) {
            syncPromise.then(() => this.refresh()).catch(() => {});
        }
    },
    
    setupDataListeners() {
        window.addEventListener('projectDataChanged', (e) => {
            // Skontroluj či je bottom sheet otvorený
            const sheet = document.getElementById('bottomSheet');
            const isSheetOpen = sheet && sheet.classList.contains('active');
            
            if (this.currentPage === 'dashboard') {
                this.refreshProjectCard(e.detail.projectId);
            }
            
            // Neobnovuj detail ak je sheet otvorený (idú lokálne aktualizácie)
            if (this.currentProjectId === e.detail.projectId && this.currentPage === 'dashboard' && isSheetOpen) {
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
        card.innerHTML = this._generateCardHTML(project, stats);
    },

    _generateCardHTML(p, stats) {
        const remainingColor = stats.remaining < 0 ? '#ef4444' : '#10b981';
        return `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.75rem;">
                <div>
                    <div class="m-project-title">${p.name}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${p.type}</div>
                </div>
                <div style="text-align: right;">
                    <span class="m-badge">${stats.progress}% Hotovo</span>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; text-align: center;">
                <div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.25rem;">Minuté</div>
                    <div style="font-size: 0.9rem; font-weight: 800;">${Math.round(stats.totalSpent).toLocaleString()} €</div>
                </div>
                <div style="border-left: 1px solid #f3f4f6; border-right: 1px solid #f3f4f6;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.25rem;">Zostáva</div>
                    <div style="font-size: 0.9rem; font-weight: 800; color: ${remainingColor};">${Math.round(stats.remaining).toLocaleString()} €</div>
                </div>
                <div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.25rem;">Limit</div>
                    <div style="font-size: 0.9rem; font-weight: 800;">${Math.round(stats.totalBudget).toLocaleString()} €</div>
                </div>
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
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const syncIcon = document.getElementById('syncIcon');
        const lastSyncEl = document.getElementById('lastSync');
        let lastSyncTime = null;
        
        const updateStatus = (online) => {
            if (online) {
                if (dot) dot.style.background = '#10b981';
                if (text) text.textContent = 'Online';
            } else {
                if (dot) dot.style.background = '#ef4444';
                if (text) text.textContent = 'Offline';
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
            if (lastSyncEl) lastSyncEl.textContent = `OK - ${formatLastSync()}`;
            const icon = document.getElementById('syncIcon');
            if (icon) icon.classList.remove('fa-spin');
        });
        
        window.addEventListener('syncError', (event) => {
            updateStatus(false);
            if (event && event.detail && event.detail.reason && lastSyncEl) {
                lastSyncEl.textContent = event.detail.reason;
            }
            const icon = document.getElementById('syncIcon');
            if (icon) icon.classList.remove('fa-spin');
        });
        
        window.addEventListener('syncStart', () => {
            const icon = document.getElementById('syncIcon');
            if (icon) icon.classList.add('fa-spin');
        });
        
        // Update last sync time periodically
        setInterval(() => {
            if (lastSyncTime) {
                lastSyncEl.textContent = `OK - ${formatLastSync()}`;
            }
        }, 60000);
        
        // Initial status
        console.log("Setting initial status to", navigator.onLine);
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

        container.innerHTML = `
            <h3 style="margin: 1rem 0 1rem; font-weight: 800;">Aktuálne projekty</h3>
            ${projects.length ? projects.map(p => this.createProjectCard(p)).join('') : '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Žiadne projekty.</p>'}
        `;
    },

    createProjectCard(p) {
        const stats = Projects.calculateStats(p);
        return `
            <div class="m-card" onclick="App.showProjectDetail('${p.id}')" data-project-id="${p.id}">
                ${this._generateCardHTML(p, stats)}
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

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                <h4 style="margin: 0; font-weight: 800;">Fazy a ulohy</h4>
                <button class="m-icon-btn" onclick="App.showPhaseForm('${project.id}')" aria-label="Pridat fazu">
                    <i class="fas fa-plus"></i>
                </button>
            </div>

            ${stats.phaseStats.length ? stats.phaseStats.map(ph => `
                <div class="m-phase" data-phase-id="${ph.id}">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <div style="font-weight: 700; font-size: 0.9rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${ph.name}
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0;">
                            <span style="font-weight: 800; font-size: 0.85rem; color: ${ph.isOverBudget ? '#ef4444' : 'var(--primary)'}">${ph.progress}%</span>
                            <button class="m-icon-btn" onclick="App.showEditPhaseForm('${project.id}', '${ph.id}')" aria-label="Upravit fazu">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="m-icon-btn m-icon-btn-danger" onclick="App.deletePhase('${project.id}', '${ph.id}')" aria-label="Odstranit fazu">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
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
                                <button onclick="App.deleteTask('${project.id}', '${ph.id}', '${t.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.5rem; font-size: 1rem;">
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
            `).join('') : `
                <div class="m-phase">
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Ziadne fazy. Pridaj prvu pre sledovanie progresu.</p>
                    <button class="m-btn" onclick="App.showPhaseForm('${project.id}')" style="margin-top: 0.75rem;">
                        <i class="fas fa-plus-circle"></i> Pridat fazu
                    </button>
                </div>
            `}
        `;

        document.getElementById('sheetContent').innerHTML = content;
        this.showSheet();
        this.renderTransactionsInSheet(project);
    },

    renderTransactionsInSheet(project) {
        const host = document.getElementById('sheetContent');
        if (!host) return;

        const oldSection = document.getElementById('mobile-transactions-section');
        if (oldSection) oldSection.remove();

        const activeTransactions = (project.transactions || [])
            .filter(t => !t.deleted)
            .slice()
            .sort((a, b) => (new Date(b.date || b.createdAt || 0)) - (new Date(a.date || a.createdAt || 0)));

        const rows = activeTransactions.length
            ? activeTransactions.map(t => this.createTransactionRow(project, t)).join('')
            : '<p style="color: var(--text-muted); font-size: 0.85rem;">Zatial ziadne vydavky.</p>';

        host.insertAdjacentHTML('beforeend', `
            <div id="mobile-transactions-section">
                <h4 style="margin: 1.5rem 0 1rem; font-weight: 800;">Vydavky</h4>
                <div class="m-phase" style="padding: 0.85rem;">
                    <button class="m-btn" onclick="App.openAddExpense('${project.id}')" style="margin: 0 0 0.75rem 0;">
                        <i class="fas fa-plus-circle"></i> Pridat vydavok
                    </button>
                    <div>${rows}</div>
                </div>
            </div>
        `);
    },

    createTransactionRow(project, transaction) {
        const phase = (project.phases || []).find(p => p.id === transaction.phaseId && !p.deleted);
        const phaseName = phase ? phase.name : 'Nezadana faza';
        const categoryIcon = {
            material: 'fa-cubes',
            labor: 'fa-hammer',
            transport: 'fa-truck',
            other: 'fa-box-open'
        }[transaction.category || 'other'] || 'fa-receipt';
        const txDate = transaction.date || transaction.createdAt || new Date().toISOString();

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.6rem 0; border-bottom: 1px solid #eef2f7;">
                <div style="display: flex; align-items: center; gap: 0.6rem; min-width: 0;">
                    <i class="fas ${categoryIcon}" style="color: var(--primary); width: 1rem;"></i>
                    <div style="min-width: 0;">
                        <div style="font-size: 0.88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${transaction.description || 'Vydavok'}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${phaseName} | ${new Date(txDate).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
                    <span style="font-size: 0.85rem; font-weight: 800;">${Number(transaction.amount || 0).toLocaleString()} EUR</span>
                    <button onclick="App.deleteTransaction('${project.id}', '${transaction.id}')" style="background: none; border: none; color: #ef4444; padding: 0.35rem; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

    },

    addTask(projectId, phaseId) {
        const input = document.getElementById(`nt-${phaseId}`);
        const text = input.value.trim();
        if (!text) return;
        
        Projects.addTask(projectId, phaseId, text);
        input.value = '';
        
        // Aktualizuj len zoznam úloh v sheet okne
        const project = Projects.get(projectId);
        if (project) {
            const phase = project.phases.find(p => p.id === phaseId);
            if (phase) {
                const tasksHtml = UIHelpers.renderTasksList(phase.tasks, projectId, phaseId, 'mobile');
                const tasksContainer = document.querySelector(`[data-phase-id="${phaseId}"] .m-tasks`);
                if (tasksContainer) tasksContainer.innerHTML = tasksHtml;
            }
        }
    },

    toggleTask(projectId, phaseId, taskId) {
        TaskHelpers.handleToggleTask(projectId, phaseId, taskId);
        
        // Aktualizuj len zoznam úloh v sheet okne
        const project = Projects.get(projectId);
        if (project) {
            const phase = project.phases.find(p => p.id === phaseId);
            if (phase) {
                const tasksHtml = UIHelpers.renderTasksList(phase.tasks, projectId, phaseId, 'mobile');
                const tasksContainer = document.querySelector(`[data-phase-id="${phaseId}"] .m-tasks`);
                if (tasksContainer) tasksContainer.innerHTML = tasksHtml;
            }
        }
    },

    deleteTask(projectId, phaseId, taskId) {
        TaskHelpers.handleDeleteTask(projectId, phaseId, taskId);
        
        // Aktualizuj len zoznam úloh v sheet okne
        const project = Projects.get(projectId);
        if (project) {
            const phase = project.phases.find(p => p.id === phaseId);
            if (phase) {
                const tasksHtml = UIHelpers.renderTasksList(phase.tasks, projectId, phaseId, 'mobile');
                const tasksContainer = document.querySelector(`[data-phase-id="${phaseId}"] .m-tasks`);
                if (tasksContainer) tasksContainer.innerHTML = tasksHtml;
            }
        }
    },

    // --- PHASES (MOBILE) ---
    showPhaseForm(projectId) {
        const project = Projects.get(projectId);
        if (!project) return;
        this.currentProjectId = projectId;

        document.getElementById('sheetContent').innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 style="font-weight: 800;">Pridat fazu</h2>
                <button class="m-icon-btn" onclick="App.showProjectDetail('${projectId}')" aria-label="Spat">
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>

            <div class="m-phase">
                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">NAZOV FAZY</label>
                <input type="text" id="m_ph_name" class="m-input" placeholder="napr. Zaklady">

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">ROZPOCET (EUR)</label>
                <input type="number" id="m_ph_budget" class="m-input" placeholder="0.00" inputmode="decimal">

                <button class="m-btn" onclick="App.saveNewPhase('${projectId}')" style="margin-top: 0.25rem;">
                    <i class="fas fa-check-circle"></i> Pridat fazu
                </button>
                <button class="m-btn" onclick="App.showProjectDetail('${projectId}')" style="margin-top: 0.5rem; background: #e5e7eb; color: var(--text-dark);">
                    <i class="fas fa-arrow-left"></i> Spat
                </button>
            </div>
        `;
        this.showSheet();

        setTimeout(() => {
            const nameInput = document.getElementById('m_ph_name');
            if (nameInput) nameInput.focus();
        }, 0);
    },

    saveNewPhase(projectId) {
        const nameInput = document.getElementById('m_ph_name');
        const budgetInput = document.getElementById('m_ph_budget');
        const name = (nameInput && nameInput.value ? nameInput.value : '').trim();
        const budget = budgetInput && budgetInput.value ? budgetInput.value : 0;

        if (!name) return alert('Zadaj nazov fazy');

        Projects.addPhase(projectId, name, budget);
        this.refreshProjectCard(projectId);
        this.showProjectDetail(projectId);
    },

    showEditPhaseForm(projectId, phaseId) {
        const project = Projects.get(projectId);
        if (!project) return;
        const phase = (project.phases || []).find(p => p.id === phaseId && !p.deleted);
        if (!phase) return;
        this.currentProjectId = projectId;

        document.getElementById('sheetContent').innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 style="font-weight: 800;">Upravit fazu</h2>
                <button class="m-icon-btn" onclick="App.showProjectDetail('${projectId}')" aria-label="Spat">
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>

            <div class="m-phase">
                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">NAZOV FAZY</label>
                <input type="text" id="m_edit_ph_name" class="m-input" placeholder="napr. Zaklady">

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">ROZPOCET (EUR)</label>
                <input type="number" id="m_edit_ph_budget" class="m-input" placeholder="0.00" inputmode="decimal">

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">OCAKAVANE DODATOCNE NAKLADY (EUR)</label>
                <input type="number" id="m_edit_ph_extra" class="m-input" placeholder="0.00" inputmode="decimal">

                <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">POZNAMKY</label>
                <textarea id="m_edit_ph_notes" class="m-input" style="height: 90px;"></textarea>

                <button class="m-btn" onclick="App.updatePhase('${projectId}', '${phaseId}')" style="margin-top: 0.25rem;">
                    <i class="fas fa-check-circle"></i> Ulozit zmeny
                </button>
                <button class="m-btn" onclick="App.showProjectDetail('${projectId}')" style="margin-top: 0.5rem; background: #e5e7eb; color: var(--text-dark);">
                    <i class="fas fa-arrow-left"></i> Spat
                </button>
            </div>
        `;
        this.showSheet();

        const nameEl = document.getElementById('m_edit_ph_name');
        const budgetEl = document.getElementById('m_edit_ph_budget');
        const extraEl = document.getElementById('m_edit_ph_extra');
        const notesEl = document.getElementById('m_edit_ph_notes');
        if (nameEl) nameEl.value = phase.name || '';
        if (budgetEl) budgetEl.value = (phase.budget !== undefined && phase.budget !== null) ? phase.budget : 0;
        if (extraEl) extraEl.value = (phase.expectedExtra !== undefined && phase.expectedExtra !== null) ? phase.expectedExtra : 0;
        if (notesEl) notesEl.value = phase.notes || '';

        setTimeout(() => {
            if (nameEl) nameEl.focus();
        }, 0);
    },

    updatePhase(projectId, phaseId) {
        const nameEl = document.getElementById('m_edit_ph_name');
        const budgetEl = document.getElementById('m_edit_ph_budget');
        const extraEl = document.getElementById('m_edit_ph_extra');
        const notesEl = document.getElementById('m_edit_ph_notes');

        const name = (nameEl && nameEl.value ? nameEl.value : '').trim();
        const budget = parseFloat(budgetEl && budgetEl.value ? budgetEl.value : 0) || 0;
        const expectedExtra = parseFloat(extraEl && extraEl.value ? extraEl.value : 0) || 0;
        const notes = notesEl && typeof notesEl.value === 'string' ? notesEl.value : '';

        if (!name) return alert('Zadaj nazov fazy');

        Projects.updatePhase(projectId, phaseId, { name, budget, expectedExtra, notes });
        this.refreshProjectCard(projectId);
        this.showProjectDetail(projectId);
    },

    deletePhase(projectId, phaseId) {
        if (!confirm('Odstranit tuto fazu?')) return;
        Projects.deletePhase(projectId, phaseId);
        this.refreshProjectCard(projectId);
        this.showProjectDetail(projectId);
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

        if (this.pendingExpenseProjectId) {
            const projectSelect = document.getElementById('m_project');
            if (projectSelect) {
                projectSelect.value = this.pendingExpenseProjectId;
                this.updatePhaseSelect(this.pendingExpenseProjectId);
            }

            if (this.pendingExpensePhaseId) {
                const phaseSelect = document.getElementById('m_phase');
                if (phaseSelect && Array.from(phaseSelect.options).some(o => o.value === this.pendingExpensePhaseId)) {
                    phaseSelect.value = this.pendingExpensePhaseId;
                }
            }
        }
    },

    updatePhaseSelect(projectId) {
        const project = Projects.get(projectId);
        const select = document.getElementById('m_phase');
        if (!project) {
            select.innerHTML = '<option value="">-- Vyber projekt --</option>';
            return;
        }

        const activePhases = (project.phases || []).filter(p => !p.deleted);
        if (!activePhases.length) {
            select.innerHTML = '<option value="">-- Projekt nema aktivne fazy --</option>';
            return;
        }

        select.innerHTML = activePhases.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    },

    saveTransaction() {
        const pid = document.getElementById('m_project').value;
        const phid = document.getElementById('m_phase').value;
        const cat = document.getElementById('m_category').value;
        const amount = document.getElementById('m_amount').value;
        const desc = document.getElementById('m_desc').value;

        if (!pid || !phid || !amount) return alert('Chyba suma alebo faza!');

        Projects.addTransaction(pid, phid, amount, desc, cat);
        this.pendingExpenseProjectId = pid;
        this.pendingExpensePhaseId = phid;
        alert('Hotovo!');
        this.navigate('dashboard');
        this.showProjectDetail(pid);
    },

    openAddExpense(projectId, phaseId = '') {
        this.pendingExpenseProjectId = projectId || null;
        this.pendingExpensePhaseId = phaseId || null;
        this.hideSheet();
        this.navigate('add');
    },

    deleteTransaction(projectId, transactionId) {
        if (!confirm('Odstranit tento vydavok?')) return;

        Projects.deleteTransaction(projectId, transactionId);
        this.refresh();
    },

    // --- ACTIONS ---
    async syncNow() {
        let syncBaseUrl = Store.getSyncBaseUrl();

        if (!syncBaseUrl) {
            // Predvolená hodnota je teraz tvoja zabezpečená Tailscale doména
            const defaultUrl = Store.getStoredSyncBaseUrl() || 'https://doma-pc.tail85a624.ts.net:8005';
            const input = prompt('Zadajte sync URL servera (napr. https://doma-pc.tail85a624.ts.net:8005):', defaultUrl);
            if (input === null) return;

            // Druhý parameter 'true' povolí HTTP adresy (pre istotu), ale preferujeme HTTPS
            if (!Store.setSyncBaseUrl(input, true)) {
                alert('Neplatná URL adresa.');
                return;
            }
            syncBaseUrl = Store.getSyncBaseUrl();
        }

        const result = await Store.manualSyncNow();
        if (!result.success && result.reason) {
            alert(`Synchronizacia zlyhala: ${result.reason}`);
        }
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
