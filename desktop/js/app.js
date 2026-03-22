window.onerror = function(msg, url, line) {
    console.error("JS ERROR:", msg, "at line", line);
    document.getElementById('contentArea').innerHTML = '<div style="padding:2rem;background:#fee2e2;color:#991b1b;"><h3>Chyba:</h3><pre>' + msg + '</pre><p>Riadok: ' + line + '</p></div>';
    return true;
};

const App = {
    currentPage: 'dashboard',
    currentProjectId: null,

    init() {
        console.log("App.init() called");
        console.log("Chart defined:", typeof Chart !== 'undefined');
        console.log("Projects defined:", typeof Projects !== 'undefined');
        console.log("Store defined:", typeof Store !== 'undefined');
        
        this.clearLegacyServiceWorkers();
        this.bindEvents();
        this.setupStatusIndicator();
        
        // Počká na prvú synchronizáciu pred renderovaním
        const syncPromise = Store.initSync();
        
        if (syncPromise && syncPromise.then) {
            syncPromise.then(() => {
                console.log("First sync complete, rendering dashboard");
                this.navigate(this.currentPage);
            }).catch(() => {
                console.log("Sync failed or offline, rendering with local data");
                this.navigate(this.currentPage);
            });
        } else {
            // Ak je offline, initSync vracia resolve()
            this.navigate(this.currentPage);
        }
    },

    clearLegacyServiceWorkers() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        }
    },

    setupStatusIndicator() {
        const el = document.getElementById('serverStatus');
        const updateStatus = (online) => {
            if (online) {
                el.style.background = '#ecfdf5';
                el.style.color = '#047857';
                el.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Server beží';
            } else {
                el.style.background = '#fef2f2';
                el.style.color = '#991b1b';
                el.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span> Odpojené';
            }
        };

        window.addEventListener('syncSuccess', () => updateStatus(true));
        window.addEventListener('syncError', () => updateStatus(false));
        
        window.addEventListener('projectDataChanged', (e) => {
            if (this.currentPage === 'project-detail' && e.detail.projectId === this.currentProjectId) {
                this.refreshProjectDetail();
            } else if (this.currentPage === 'dashboard') {
                this.refreshProjectCard(e.detail.projectId);
            }
        });
        
        window.addEventListener('projectsListChanged', () => {
            if (this.currentPage === 'dashboard') {
                this.refreshProjectList();
            }
        });
    },
    
    refreshProjectCard(projectId) {
        const project = Projects.get(projectId);
        if (!project) return;
        
        const card = document.querySelector(`[data-project-id="${projectId}"]`);
        if (card) {
            const stats = Projects.calculateStats(project);
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 1.25rem;">
                    <h3 style="font-size: 1.15rem; margin: 0; font-weight: 700;">${project.name}</h3>
                    <span class="badge">${project.type}</span>
                </div>
                <div style="height: 10px; background: #f3f4f6; border-radius: 5px; overflow: hidden; margin-bottom: 0.75rem;">
                    <div style="width: ${stats.progress}%; height: 100%; background: var(--primary); transition: width 0.5s;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
                    <span>${stats.progress}% hotovo</span>
                    <span style="${stats.isOverBudget ? 'color: #ef4444; font-weight: 700;' : ''}">${stats.totalSpent.toLocaleString()} €</span>
                </div>
            `;
        }
    },
    
    refreshProjectList() {
        const container = document.querySelector('.grid');
        if (!container) return;
        
        const projects = Projects.getAll();
        container.innerHTML = projects.map(p => `
            <div class="card shadow" style="padding: 1.5rem; cursor: pointer; transition: 0.3s;" onclick="App.openProject('${p.id}')" data-project-id="${p.id}">
                <div style="display: flex; justify-content: space-between; margin-bottom: 1.25rem;">
                    <h3 style="font-size: 1.15rem; margin: 0; font-weight: 700;">${p.name}</h3>
                    <span class="badge">${p.type}</span>
                </div>
                <div style="height: 10px; background: #f3f4f6; border-radius: 5px; overflow: hidden; margin-bottom: 0.75rem;">
                    <div style="width: ${Projects.calculateStats(p).progress}%; height: 100%; background: var(--primary); transition: width 0.5s;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
                    <span>${Projects.calculateStats(p).progress}% hotovo</span>
                    <span style="${Projects.calculateStats(p).isOverBudget ? 'color: #ef4444; font-weight: 700;' : ''}">${Projects.calculateStats(p).totalSpent.toLocaleString()} €</span>
                </div>
            </div>
        `).join('');
    },
    
    refreshProjectDetail() {
        const container = document.getElementById('contentArea');
        if (!container || !this.currentProjectId) return;
        
        const project = Projects.get(this.currentProjectId);
        if (!project) {
            this.navigate('dashboard');
            return;
        }

        const stats = Projects.calculateStats(project);
        const startDate = project.startDate ? new Date(project.startDate).toLocaleDateString() : '---';
        const endDate = project.endDate ? new Date(project.endDate).toLocaleDateString() : '---';

        container.innerHTML = `
            <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <button onclick="App.navigate('dashboard')" class="btn btn-secondary" style="margin-bottom: 1rem;"><i class="fas fa-arrow-left"></i> Späť</button>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <h2 style="font-size: 2rem; margin: 0;">${project.name}</h2>
                        <button onclick="App.showEditProjectForm('${project.id}')" class="btn btn-secondary btn-sm" title="Upraviť projekt"><i class="fas fa-edit"></i></button>
                    </div>
                    <p style="color: var(--text-muted); margin-top: 0.5rem;">${project.description || 'Bez popisu'}</p>
                    <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
                        <i class="far fa-calendar-alt"></i> ${startDate} — ${endDate}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.75rem; font-weight: 800;">${stats.totalSpent.toLocaleString()} / ${stats.totalBudget.toLocaleString()} €</div>
                    <div style="color: var(--text-muted); font-weight: 600;">${stats.progress}% hotovo</div>
                    <button onclick="App.deleteProject('${project.id}')" class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: #fecaca; margin-top: 0.5rem;"><i class="fas fa-trash"></i> Vymazať projekt</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3>Fázy projektu</h3>
                        <button onclick="App.showPhaseForm('${project.id}')" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Pridať fázu</button>
                    </div>
                    <div class="phases-list">
                        ${stats.phaseStats.length ? stats.phaseStats.map(p => this.createPhaseRow(project.id, p)).join('') : '<p>Žiadne fázy. Pridajte prvú pre sledovanie progresu.</p>'}
                    </div>
                </div>
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3>Posledné výdavky</h3>
                        <button onclick="App.showTransactionForm('${project.id}')" class="btn btn-primary btn-sm"><i class="fas fa-euro-sign"></i> Pridať</button>
                    </div>
                    <div class="transactions-list card shadow" style="padding: 1.25rem;">
                        ${project.transactions.filter(t => !t.deleted).length ? project.transactions.filter(t => !t.deleted).slice().reverse().map(t => this.createTransactionRow(project.id, t)).join('') : '<p style="color: var(--text-muted); font-size: 0.875rem;">Žiadne výdavky.</p>'}
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.dataset.page) { // Ignorujeme buttony bez page (napr. onclick akcie)
                btn.addEventListener('click', () => this.navigate(btn.dataset.page));
            }
        });

        document.getElementById('quickAddBtn').addEventListener('click', () => this.showNewProjectForm());
    },

    // --- NEW FEATURES ---

    exitApp() {
        if (confirm("Chcete naozaj ukončiť aplikáciu a vypnúť server?")) {
            Store.shutdownServer();
        }
    },

    async showMobileAccess() {
        this.showModal('Mobilný prístup', '<p>Načítavam informácie...</p>');
        
        try {
            const resp = await fetch('/api/info');
            const info = await resp.json();
            const url = `http://${info.ip}:${info.port}/mobile/`;
            
            this.showModal('Mobilný prístup', `
                <div style="text-align: center;">
                    <p style="margin-bottom: 1rem; color: var(--text-muted);">
                        Naskenujte tento kód vaším mobilom. <br>
                        Uistite sa, že máte zapnutý <strong>Tailscale</strong> (alebo ste na rovnakej Wi-Fi).
                    </p>
                    <div style="display: flex; justify-content: center; margin-bottom: 1.5rem;">
                        <div id="qrcode" style="background: white; padding: 1rem; border-radius: 1rem; border: 1px solid #e5e7eb;"></div>
                    </div>
                    <div style="background: #f3f4f6; padding: 0.75rem; border-radius: 0.5rem; word-break: break-all; font-family: monospace;">
                        <a href="${url}" target="_blank">${url}</a>
                    </div>
                </div>
            `);

            setTimeout(() => {
                const container = document.getElementById("qrcode");
                if (container && typeof qrcode !== 'undefined') {
                    const qr = qrcode(0, 'L');
                    qr.addData(url);
                    qr.make();
                    container.innerHTML = qr.createSvgTag(5, 4); 
                }
            }, 100);

        } catch (e) {
            this.showModal('Chyba', '<p>Nepodarilo sa získať IP adresu servera.</p>');
        }
    },

    navigate(page, projectId = null) {
        this.currentPage = page;
        this.currentProjectId = projectId;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
        
        const titleMap = {
            'dashboard': 'Dashboard',
            'projects': 'Všetky projekty',
            'project-detail': 'Detail projektu'
        };
        document.getElementById('pageTitle').textContent = titleMap[page] || page;
        
        this.render();
    },

    refresh() {
        this.render();
    },

    render() {
        const area = document.getElementById('contentArea');
        area.innerHTML = ''; 

        if (this.currentPage === 'dashboard') {
            this.renderDashboard(area);
        } else if (this.currentPage === 'projects') {
            this.renderProjects(area);
        } else if (this.currentPage === 'project-detail') {
            this.renderProjectDetail(area, this.currentProjectId);
        }

        area.classList.remove('fade-in');
        void area.offsetWidth; 
        area.classList.add('fade-in');
    },

    renderDashboard(container) {
        console.log("renderDashboard called");
        const projects = Projects.getAll();
        console.log("Projects found:", projects.length);
        const stats = projects.map(p => ({
            name: p.name,
            spent: Projects.calculateStats(p).totalSpent,
            budget: p.budget
        }));

        const totalBudget = stats.reduce((sum, s) => sum + s.budget, 0);
        const totalSpent = stats.reduce((sum, s) => sum + s.spent, 0);

        container.innerHTML = `
            <div class="stats-row" style="display: flex; gap: 1.5rem; margin-bottom: 2.5rem;">
                <div class="card shadow" style="background: #fff; padding: 1.5rem; border-radius: 1rem; flex: 1; border-left: 5px solid var(--primary);">
                    <div style="color: var(--text-muted); font-size: 0.875rem; font-weight: 600;">Celkový rozpočet</div>
                    <div style="font-size: 1.75rem; font-weight: 800; color: var(--primary);">${totalBudget.toLocaleString()} €</div>
                </div>
                <div class="card shadow" style="background: #fff; padding: 1.5rem; border-radius: 1rem; flex: 1; border-left: 5px solid #ef4444;">
                    <div style="color: var(--text-muted); font-size: 0.875rem; font-weight: 600;">Aktuálne výdavky</div>
                    <div style="font-size: 1.75rem; font-weight: 800;">${totalSpent.toLocaleString()} €</div>
                </div>
                <div class="card shadow" style="background: #fff; padding: 1.5rem; border-radius: 1rem; flex: 1; border-left: 5px solid #3b82f6;">
                    <div style="color: var(--text-muted); font-size: 0.875rem; font-weight: 600;">Zostáva</div>
                    <div style="font-size: 1.75rem; font-weight: 800;">${(totalBudget - totalSpent).toLocaleString()} €</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem;">
                <div class="card shadow" style="padding: 2rem;">
                    <h3 style="margin-bottom: 1.5rem;">Rozdelenie podľa projektov</h3>
                    <canvas id="budgetChart" style="max-height: 250px;"></canvas>
                </div>
                <div class="card shadow" style="padding: 2rem;">
                    <h3 style="margin-bottom: 1.5rem;">Rozdelenie podľa kategórií</h3>
                    <canvas id="categoryChart" style="max-height: 250px;"></canvas>
                </div>
                <div class="card shadow" style="padding: 2rem;">
                    <h3 style="margin-bottom: 1.5rem;">Čerpanie rozpočtu (%)</h3>
                    <canvas id="progressChart" style="max-height: 250px;"></canvas>
                </div>
            </div>

            <h3 style="margin-bottom: 1.5rem;">Aktívne projekty</h3>
            <div class="grid">
                ${projects.length ? projects.map(p => this.createProjectCard(p)).join('') : '<p>Zatiaľ nemáte žiadne projekty.</p>'}
            </div>
        `;

        if (projects.length) {
            setTimeout(() => this.renderCharts(stats), 10);
        }
    },

    renderCharts(stats) {
        console.log("renderCharts called with:", stats);
        try {
            if (typeof Chart === 'undefined') {
                console.error("Chart.js not loaded!");
                return;
            }
            
            const projects = Projects.getAll();
            const globalCategoryStats = {
                material: 0,
                labor: 0,
                transport: 0,
                other: 0
            };

            projects.forEach(p => {
                const pStats = Projects.calculateStats(p);
                Object.keys(globalCategoryStats).forEach(cat => {
                    globalCategoryStats[cat] += pStats.categoryStats[cat];
                });
            });

            const ctx1 = document.getElementById('budgetChart');
            if (ctx1) {
                new Chart(ctx1, {
                    type: 'doughnut',
                    data: {
                        labels: stats.map(s => s.name),
                        datasets: [{
                            data: stats.map(s => s.spent),
                            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
                        }]
                    },
                    options: { 
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom' } } 
                    }
                });
            }

            const ctxCat = document.getElementById('categoryChart');
            if (ctxCat) {
                new Chart(ctxCat, {
                    type: 'pie',
                    data: {
                        labels: ['Materiál', 'Práca', 'Doprava', 'Iné'],
                        datasets: [{
                            data: [
                                globalCategoryStats.material,
                                globalCategoryStats.labor,
                                globalCategoryStats.transport,
                                globalCategoryStats.other
                            ],
                            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']
                        }]
                    },
                    options: { 
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom' } } 
                    }
                });
            }

            const ctx2 = document.getElementById('progressChart');
            if (ctx2) {
                new Chart(ctx2, {
                    type: 'bar',
                    data: {
                        labels: stats.map(s => s.name),
                        datasets: [{
                            label: '% čerpania',
                            data: stats.map(s => s.budget > 0 ? (s.spent / s.budget) * 100 : 0),
                            backgroundColor: '#10b981',
                            borderRadius: 8
                        }]
                    },
                    options: { 
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true, max: 100 } },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        } catch (e) {
            console.error("Chart render error:", e);
        }
    },

    renderProjects(container) {
        const projects = Projects.getAll();
        container.innerHTML = `
            <div class="grid">
                ${projects.length ? projects.map(p => this.createProjectCard(p)).join('') : '<p>Žiadne projekty.</p>'}
            </div>
        `;
    },

    renderProjectDetail(container, projectId) {
        const project = Projects.get(projectId);
        if (!project) return container.innerHTML = '<p>Projekt nebol nájdený.</p>';

        const stats = Projects.calculateStats(project);
        const startDate = project.startDate ? new Date(project.startDate).toLocaleDateString() : '---';
        const endDate = project.endDate ? new Date(project.endDate).toLocaleDateString() : '---';

        container.innerHTML = `
            <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <button onclick="App.navigate('dashboard')" class="btn btn-secondary" style="margin-bottom: 1rem;"><i class="fas fa-arrow-left"></i> Späť</button>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <h2 style="font-size: 2rem; margin: 0;">${project.name}</h2>
                        <button onclick="App.showEditProjectForm('${project.id}')" class="btn btn-secondary btn-sm" title="Upraviť projekt"><i class="fas fa-edit"></i></button>
                    </div>
                    <p style="color: var(--text-muted); margin-top: 0.5rem;">${project.description || 'Bez popisu'}</p>
                    <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
                        <i class="far fa-calendar-alt"></i> ${startDate} — ${endDate}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.75rem; font-weight: 800;">${stats.totalSpent.toLocaleString()} / ${stats.totalBudget.toLocaleString()} €</div>
                    <div style="color: var(--text-muted); font-weight: 600;">${stats.progress}% hotovo</div>
                    <button onclick="App.deleteProject('${project.id}')" class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: #fecaca; margin-top: 0.5rem;"><i class="fas fa-trash"></i> Vymazať projekt</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3>Fázy projektu</h3>
                        <button onclick="App.showPhaseForm('${project.id}')" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Pridať fázu</button>
                    </div>
                    <div class="phases-list">
                        ${stats.phaseStats.length ? stats.phaseStats.map(p => this.createPhaseRow(project.id, p)).join('') : '<p>Žiadne fázy. Pridajte prvú pre sledovanie progresu.</p>'}
                    </div>
                </div>
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3>Posledné výdavky</h3>
                        <button onclick="App.showTransactionForm('${project.id}')" class="btn btn-primary btn-sm"><i class="fas fa-euro-sign"></i> Pridať</button>
                    </div>
                    <div class="transactions-list card shadow" style="padding: 1.25rem;">
                        ${project.transactions.filter(t => !t.deleted).length ? project.transactions.filter(t => !t.deleted).slice().reverse().map(t => this.createTransactionRow(project.id, t)).join('') : '<p style="color: var(--text-muted); font-size: 0.875rem;">Žiadne výdavky.</p>'}
                    </div>
                </div>
            </div>
        `;
    },

    // --- HTML COMPONENTS ---

    createProjectCard(project) {
        const stats = Projects.calculateStats(project);
        return `
            <div class="card shadow" style="padding: 1.5rem; cursor: pointer; transition: 0.3s;" onclick="App.openProject('${project.id}')" data-project-id="${project.id}">
                <div style="display: flex; justify-content: space-between; margin-bottom: 1.25rem;">
                    <h3 style="font-size: 1.15rem; margin: 0; font-weight: 700;">${project.name}</h3>
                    <span class="badge">${project.type}</span>
                </div>
                <div style="height: 10px; background: #f3f4f6; border-radius: 5px; overflow: hidden; margin-bottom: 0.75rem;">
                    <div style="width: ${stats.progress}%; height: 100%; background: var(--primary); transition: width 0.5s;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
                    <span>${stats.progress}% hotovo</span>
                    <span style="${stats.isOverBudget ? 'color: #ef4444; font-weight: 700;' : ''}">${stats.totalSpent.toLocaleString()} €</span>
                </div>
            </div>
        `;
    },

    createPhaseRow(projectId, phase) {
        const activeTasks = (phase.tasks || []).filter(t => !t.deleted);
        const hasTasks = activeTasks && activeTasks.length > 0;
        const taskHtml = activeTasks.map(t => `
            <div id="task-${t.id}" style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="App.toggleTask('${projectId}', '${phase.id}', '${t.id}')">
                <span id="task-text-${t.id}" style="flex: 1; font-size: 0.875rem; ${t.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${t.text}</span>
                <button onclick="App.deleteTask('${projectId}', '${phase.id}', '${t.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fas fa-times"></i></button>
            </div>
        `).join('');

        return `
            <div class="card shadow" style="padding: 1.25rem; margin-bottom: 1.5rem; border-left: 4px solid ${phase.isRisk ? '#f59e0b' : (phase.isOverBudget ? '#ef4444' : 'var(--primary)')}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                    <div style="font-weight: 700; font-size: 1.05rem;">${phase.name}</div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.9rem; font-weight: 600; color: ${phase.isOverBudget ? '#ef4444' : 'var(--text-muted)'};">
                            ${phase.spent.toLocaleString()} / ${phase.budget.toLocaleString()} €
                        </div>
                        ${phase.expectedExtra > 0 ? `<div style="font-size: 0.75rem; color: #f59e0b; font-weight: 700;">+ ${phase.expectedExtra.toLocaleString()} € očakávané</div>` : ''}
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 1.25rem; margin-bottom: 1rem;">
                    <div style="flex: 1; height: 12px; background: #f3f4f6; border-radius: 6px; overflow: hidden; position: relative;">
                         <input type="range" value="${phase.progress}" onchange="App.updatePhaseProgress('${projectId}', '${phase.id}', this.value)" 
                            style="position: absolute; width: 100%; height: 100%; opacity: 0; cursor: ${hasTasks ? 'default' : 'pointer'}; z-index: 2;"
                            ${hasTasks ? 'disabled' : ''}>
                         <div id="phase-progress-bar-${phase.id}" style="width: ${phase.progress}%; height: 100%; background: var(--primary); transition: width 0.3s;"></div>
                    </div>
                    <span id="phase-progress-text-${phase.id}" style="width: 45px; text-align: right; font-size: 0.9rem; font-weight: 700; color: var(--primary);">${phase.progress}%</span>
                    <div style="display: flex; gap: 0.25rem;">
                        <button onclick="App.showEditPhaseForm('${projectId}', '${phase.id}')" style="background: none; border: none; color: var(--primary); cursor: pointer; padding: 0.5rem;"><i class="fas fa-edit"></i></button>
                        <button onclick="App.deletePhase('${projectId}', '${phase.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.5rem;"><i class="fas fa-trash"></i></button>
                    </div>
                </div>

                <div style="background: #f9fafb; padding: 0.75rem; border-radius: 0.5rem;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Checklist úloh</div>
                    <div id="tasks-${phase.id}">${taskHtml}</div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                        <input type="text" id="nt-${phase.id}" placeholder="Nová úloha..." class="form-control btn-sm" style="flex: 1; padding: 0.4rem 0.75rem;">
                        <button onclick="App.addTask('${projectId}', '${phase.id}')" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i></button>
                    </div>
                </div>

                ${phase.notes ? `<div style="margin-top: 0.75rem; font-size: 0.8rem; font-style: italic; color: var(--text-muted); border-top: 1px solid #f3f4f6; padding-top: 0.5rem;">"${phase.notes}"</div>` : ''}
            </div>
        `;
    },

    addTask(projectId, phaseId) {
        const input = document.getElementById(`nt-${phaseId}`);
        const text = input.value.trim();
        if (!text) return;
        Projects.addTask(projectId, phaseId, text);
        this.refresh();
    },

    toggleTask(projectId, phaseId, taskId) {
        TaskHelpers.handleToggleTask(projectId, phaseId, taskId);
    },

    deleteTask(projectId, phaseId, taskId) {
        TaskHelpers.handleDeleteTask(projectId, phaseId, taskId);
    },

    createTransactionRow(projectId, t) {
        const icons = {
            material: '🧱',
            labor: '🛠️',
            transport: '🚚',
            other: '📦'
        };
        const icon = icons[t.category] || '💰';

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid #f3f4f6;">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                    <div style="font-size: 1.25rem;">${icon}</div>
                    <div>
                        <div style="font-weight: 600; font-size: 0.95rem;">${t.description || 'Výdavok'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${new Date(t.date).toLocaleDateString()}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-weight: 700; font-size: 1rem;">${t.amount.toLocaleString()} €</span>
                    <button onclick="App.deleteTransaction('${projectId}', '${t.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; transition: 0.2s;"><i class="fas fa-times-circle"></i></button>
                </div>
            </div>
        `;
    },

    // --- FORMS & MODALS ---

    showNewProjectForm() {
        this.showModal('Nový projekt', `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="form-group">
                    <label>Názov projektu</label>
                    <input type="text" id="p_name" placeholder="napr. Stavba domu" class="form-control">
                </div>
                <div class="form-group">
                    <label>Typ projektu</label>
                    <select id="p_type" class="form-control">
                        <option value="house">🏠 Stavba</option>
                        <option value="car">🚗 Auto</option>
                        <option value="wedding">💍 Svadba</option>
                        <option value="it">💻 IT Projekt</option>
                        <option value="other">📦 Iné</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Celkový rozpočet (€)</label>
                    <input type="number" id="p_budget" placeholder="napr. 150000" class="form-control">
                </div>
                <button onclick="App.saveNewProject()" class="btn btn-primary" style="justify-content: center; margin-top: 1rem; padding: 1rem;">Vytvoriť projekt</button>
            </div>
        `);
    },

    showEditProjectForm(projectId) {
        const project = Projects.get(projectId);
        if (!project) return;

        this.showModal('Upraviť projekt', `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="form-group">
                    <label>Názov projektu</label>
                    <input type="text" id="edit_p_name" value="${project.name}" class="form-control">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Začiatok</label>
                        <input type="date" id="edit_p_start" value="${project.startDate || ''}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Koniec (odhad)</label>
                        <input type="date" id="edit_p_end" value="${project.endDate || ''}" class="form-control">
                    </div>
                </div>
                <div class="form-group">
                    <label>Typ projektu</label>
                    <select id="edit_p_type" class="form-control">
                        <option value="house" ${project.type === 'house' ? 'selected' : ''}>🏠 Stavba</option>
                        <option value="car" ${project.type === 'car' ? 'selected' : ''}>🚗 Auto</option>
                        <option value="wedding" ${project.type === 'wedding' ? 'selected' : ''}>💍 Svadba</option>
                        <option value="it" ${project.type === 'it' ? 'selected' : ''}>💻 IT Projekt</option>
                        <option value="other" ${project.type === 'other' ? 'selected' : ''}>📦 Iné</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Celkový rozpočet (€)</label>
                    <input type="number" id="edit_p_budget" value="${project.budget}" class="form-control">
                </div>
                <button onclick="App.updateProject('${project.id}')" class="btn btn-primary" style="justify-content: center; margin-top: 1rem; padding: 1rem;">Uložiť zmeny</button>
            </div>
        `);
    },

    showPhaseForm(projectId) {
        this.showModal('Pridať fázu', `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="form-group">
                    <label>Názov fázy</label>
                    <input type="text" id="ph_name" placeholder="napr. Základy" class="form-control">
                </div>
                <div class="form-group">
                    <label>Rozpočet pre túto fázu (€)</label>
                    <input type="number" id="ph_budget" placeholder="napr. 5000" class="form-control">
                </div>
                <button onclick="App.saveNewPhase('${projectId}')" class="btn btn-primary" style="justify-content: center; margin-top: 1rem; padding: 1rem;">Pridať fázu</button>
            </div>
        `);
    },

    showEditPhaseForm(projectId, phaseId) {
        const project = Projects.get(projectId);
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase) return;

        this.showModal('Upraviť fázu', `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="form-group">
                    <label>Názov fázy</label>
                    <input type="text" id="edit_ph_name" value="${phase.name}" class="form-control">
                </div>
                <div class="form-group">
                    <label>Rozpočet pre túto fázu (€)</label>
                    <input type="number" id="edit_ph_budget" value="${phase.budget}" class="form-control">
                </div>
                <div class="form-group">
                    <label>Očakávané dodatočné náklady (€)</label>
                    <input type="number" id="edit_ph_extra" value="${phase.expectedExtra || 0}" class="form-control">
                </div>
                <div class="form-group">
                    <label>Poznámky k realizácii</label>
                    <textarea id="edit_ph_notes" class="form-control" style="height: 80px;">${phase.notes || ''}</textarea>
                </div>
                <button onclick="App.updatePhase('${projectId}', '${phase.id}')" class="btn btn-primary" style="justify-content: center; margin-top: 1rem; padding: 1rem;">Uložiť zmeny</button>
            </div>
        `);
    },

    showTransactionForm(projectId) {
        const project = Projects.get(projectId);
        const activePhases = (project?.phases || []).filter(p => p && !p.deleted);
        const seenPhaseIds = new Set();
        const uniqueActivePhases = activePhases.filter((phase) => {
            if (!phase.id || seenPhaseIds.has(phase.id)) return false;
            seenPhaseIds.add(phase.id);
            return true;
        });
        const phasesOptions = uniqueActivePhases.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        
        this.showModal('Pridať výdavok', `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="form-group">
                    <label>Suma (€)</label>
                    <input type="number" id="t_amount" placeholder="0.00" class="form-control">
                </div>
                <div class="form-group">
                    <label>Popis</label>
                    <input type="text" id="t_desc" placeholder="napr. Nákup cementu" class="form-control">
                </div>
                <div class="form-group">
                    <label>Kategória</label>
                    <select id="t_category" class="form-control">
                        <option value="material">🧱 Materiál</option>
                        <option value="labor">🛠️ Práca / Služby</option>
                        <option value="transport">🚚 Doprava</option>
                        <option value="other">📦 Iné</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Fáza</label>
                    <select id="t_phase" class="form-control" ${uniqueActivePhases.length ? '' : 'disabled'}>
                        <option value="">${uniqueActivePhases.length ? '-- Vyber fázu --' : '-- Projekt nemá aktívne fázy --'}</option>
                        ${phasesOptions}
                    </select>
                </div>
                <button onclick="App.saveNewTransaction('${projectId}')" class="btn btn-primary" style="justify-content: center; margin-top: 1rem; padding: 1rem;">Uložiť výdavok</button>
            </div>
        `);
    },

    // --- ACTIONS ---

    saveNewProject() {
        const name = document.getElementById('p_name').value;
        const type = document.getElementById('p_type').value;
        const budget = parseFloat(document.getElementById('p_budget').value) || 0;

        if (!name) return alert("Zadaj názov");

        const project = Projects.createEmpty(name, type);
        project.budget = budget;
        Projects.save(project);

        this.hideModal();
        this.navigate('project-detail', project.id);
    },

    updateProject(projectId) {
        const project = Projects.get(projectId);
        if (!project) return;

        project.name = document.getElementById('edit_p_name').value;
        project.startDate = document.getElementById('edit_p_start').value;
        project.endDate = document.getElementById('edit_p_end').value;
        project.type = document.getElementById('edit_p_type').value;
        project.budget = parseFloat(document.getElementById('edit_p_budget').value) || 0;

        if (!project.name) return alert("Zadaj názov");

        Projects.save(project);
        this.hideModal();
    },

    deleteProject(projectId) {
        if (confirm('Naozaj chcete vymazať celý projekt vrátane všetkých fáz a výdavkov? Táto akcia je nevratná.')) {
            Projects.delete(projectId);
            this.navigate('dashboard');
        }
    },

    saveNewPhase(projectId) {
        const name = document.getElementById('ph_name').value;
        const budget = document.getElementById('ph_budget').value;
        if (!name) return alert("Zadaj názov fázy");
        
        Projects.addPhase(projectId, name, budget);
        this.hideModal();

        // Okamzity refresh detailu po lokalnej zmene (bez manualneho reloadu stranky)
        if (this.currentPage === 'project-detail' && this.currentProjectId === projectId) {
            this.refreshProjectDetail();
        }
    },

    saveNewTransaction(projectId) {
        const amount = document.getElementById('t_amount').value;
        const desc = document.getElementById('t_desc').value;
        const phaseId = document.getElementById('t_phase').value;
        const category = document.getElementById('t_category').value;
        
        if (!amount || !phaseId) return alert("Zadaj sumu a vyber fázu");
        
        Projects.addTransaction(projectId, phaseId, amount, desc, category);
        this.hideModal();

        // Okamzity refresh detailu po lokalnej zmene (bez manualneho reloadu stranky)
        if (this.currentPage === 'project-detail' && this.currentProjectId === projectId) {
            this.refreshProjectDetail();
        }
    },

    updatePhase(projectId, phaseId) {
        const name = document.getElementById('edit_ph_name').value;
        const budget = parseFloat(document.getElementById('edit_ph_budget').value) || 0;
        const expectedExtra = parseFloat(document.getElementById('edit_ph_extra').value) || 0;
        const notes = document.getElementById('edit_ph_notes').value;
        
        if (!name) return alert("Zadaj názov fázy");
        
        Projects.updatePhase(projectId, phaseId, { name, budget, expectedExtra, notes });
        this.hideModal();

        // Okamzity refresh detailu po lokalnej zmene (bez manualneho reloadu stranky)
        if (this.currentPage === 'project-detail' && this.currentProjectId === projectId) {
            this.refreshProjectDetail();
        }
    },

    updatePhaseProgress(projectId, phaseId, progress) {
        Projects.updatePhase(projectId, phaseId, { progress: parseInt(progress) });
    },

    deletePhase(projectId, phaseId) {
        if(confirm('Naozaj chcete odstrániť túto fázu a všetky jej výdavky?')) {
            Projects.deletePhase(projectId, phaseId);

            // Okamzity refresh detailu po lokalnej zmene (bez manualneho reloadu stranky)
            if (this.currentPage === 'project-detail' && this.currentProjectId === projectId) {
                this.refreshProjectDetail();
            }
        }
    },

    deleteTransaction(projectId, transactionId) {
        if(confirm('Odstrániť tento výdavok?')) {
            Projects.deleteTransaction(projectId, transactionId);

            // Okamzity refresh detailu po lokalnej zmene (bez manualneho reloadu stranky)
            if (this.currentPage === 'project-detail' && this.currentProjectId === projectId) {
                this.refreshProjectDetail();
            }
        }
    },

    openProject(id) {
        this.navigate('project-detail', id);
    },

    // --- UTILS ---

    showModal(title, html) {
        const modal = document.getElementById('modal');
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = html;
        modal.style.display = 'flex';
        document.querySelector('.close-modal').onclick = () => this.hideModal();
    },

    hideModal() {
        document.getElementById('modal').style.display = 'none';
    },

    exportData() {
        const data = Store.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `projecttracker-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    },

    async showSync() {
        const rawData = Store.exportData();
        
        // 1. Odošleme dáta na server
        try {
            await fetch('/upload_from_pc', { method: 'POST', body: rawData });
        } catch (e) {
            return alert("Chyba: Váš PC server (sync_server.py) nebeží!");
        }

        // 2. Vypýtame si IP adresu PC od servera
        let syncUrl = '';
        try {
            const resp = await fetch('/api/info');
            const info = await resp.json();
            syncUrl = `http://${info.ip}:${info.port}/download_to_mobile`;
        } catch (e) {
            // Záloha ak by fetch nešiel (skúsime lokálne)
            syncUrl = `http://${window.location.hostname}:8000/download_to_mobile`;
        }

        this.showModal('Synchronizácia', `
            <div style="text-align: center;">
                <p style="margin-bottom: 1rem; font-size: 0.9rem; font-weight: 700; color: #ef4444;">
                    DÔLEŽITÉ PRE IPHONE:
                </p>
                <p style="font-size: 0.8rem; margin-bottom: 1rem; background: #fee2e2; padding: 0.75rem; border-radius: 0.5rem; color: #991b1b;">
                    Pre funkčnú synchronizáciu musíte mať v mobile otvorenú aplikáciu cez túto adresu:<br>
                    <strong style="font-size: 1rem;">http://${info.ip}:${info.port}/mobile/</strong>
                </p>

                <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #e5e7eb;">

                <p style="margin-bottom: 1rem; font-size: 0.9rem; font-weight: 700;">1. STIAHNUTIE DO MOBILU</p>
                <div style="display: flex; justify-content: center; margin-bottom: 1rem;">
                    <div id="qrcode" style="background: white; padding: 1rem; border-radius: 1rem; border: 1px solid #e5e7eb;"></div>
                </div>
                
                <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #e5e7eb;">
                <p style="margin-bottom: 1rem; font-size: 0.9rem; font-weight: 700;">2. PRIJATIE Z MOBILU</p>
                <button onclick="App.downloadFromMobile()" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 1rem;">
                    <i class="fas fa-download"></i> Stiahnuť zmeny z mobilu
                </button>
            </div>
        `);
        
        setTimeout(() => {
            const container = document.getElementById("qrcode");
            if (container && typeof qrcode !== 'undefined') {
                const qr = qrcode(0, 'L');
                qr.addData(syncUrl);
                qr.make();
                container.innerHTML = qr.createSvgTag(5, 4); 
            }
        }, 100);
    },

    async downloadFromMobile() {
        try {
            const response = await fetch('/download_to_pc');
            if (!response.ok) throw new Error("Žiadne dáta z mobilu na serveri.");
            
            const jsonData = await response.json();
            const result = Store.mergeData(jsonData);
            
            if (result.success) {
                alert(`Synchronizácia úspešná! Pridaných/aktualizovaných ${result.newItems} položiek.`);
                this.refresh();
                this.hideModal();
            } else {
                alert("Chyba pri zlučovaní dát: " + result.error);
            }
        } catch (e) {
            alert("Nepodarilo sa stiahnuť dáta. Najprv ich odošlite z mobilu.");
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
