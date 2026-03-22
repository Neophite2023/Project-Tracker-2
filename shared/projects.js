const Projects = {
    getAll() {
        return Store.getProjects();
    },

    get(id) {
        return this.getAll().find(p => p.id === id);
    },

    save(project, skipUpdatedAt = false) {
        const projects = this.getAll();
        const index = projects.findIndex(p => p.id === project.id);
        
        if (!skipUpdatedAt) {
            project.updatedAt = Date.now();
        }
        
        if (index !== -1) projects[index] = project;
        else {
            project.createdAt = project.createdAt || new Date().toISOString();
            project.updatedAt = project.updatedAt || Date.now();
            projects.push(project);
        }
        
        Store.saveProjects(projects);
    },

    delete(id) {
        const projects = this.getAll().filter(p => p.id !== id);
        Store.saveProjects(projects);
    },

    // --- Fázy ---
    addPhase(projectId, name, budget) {
        const project = this.get(projectId);
        if (!project) return;
        
        const phase = {
            id: Store.generateId(),
            name,
            budget: parseFloat(budget) || 0,
            progress: 0,
            tasks: [],
            notes: '',
            expectedExtra: 0,
            createdAt: new Date().toISOString(),
            updatedAt: Date.now()
        };
        
        project.phases.push(phase);
        project.updatedAt = Date.now();
        this.save(project);
        return phase;
    },

    updatePhase(projectId, phaseId, data) {
        const project = this.get(projectId);
        if (!project) return;
        
        const phase = project.phases.find(p => p.id === phaseId);
        if (phase) {
            Object.assign(phase, data);
            phase.updatedAt = Date.now();
            
            // Ak sa zmenili úlohy, prepočítame progres automaticky
            if (phase.tasks && phase.tasks.length > 0) {
                const completed = phase.tasks.filter(t => t.completed).length;
                phase.progress = Math.round((completed / phase.tasks.length) * 100);
            }
            
            project.updatedAt = Date.now();
            this.save(project);
        }
    },

    // --- Úlohy v rámci fázy ---
    addTask(projectId, phaseId, text) {
        const project = this.get(projectId);
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase) return;

        if (!phase.tasks) phase.tasks = [];
        phase.tasks.push({
            id: Store.generateId(),
            text,
            completed: false,
            createdAt: new Date().toISOString(),
            updatedAt: Date.now()
        });
        
        phase.updatedAt = Date.now();
        project.updatedAt = Date.now();
        this.save(project);
    },

    toggleTask(projectId, phaseId, taskId) {
        const project = this.get(projectId);
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase || !phase.tasks) return;

        const task = phase.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            task.updatedAt = Date.now();
            phase.updatedAt = Date.now();
            project.updatedAt = Date.now();
            this.save(project);
        }
    },

    deleteTask(projectId, phaseId, taskId) {
        const project = this.get(projectId);
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase || !phase.tasks) return;

        phase.tasks = phase.tasks.filter(t => t.id !== taskId);
        phase.updatedAt = Date.now();
        project.updatedAt = Date.now();
        this.save(project);
    },

    deletePhase(projectId, phaseId) {
        const project = this.get(projectId);
        if (!project) return;
        
        project.phases = project.phases.filter(p => p.id !== phaseId);
        project.transactions = project.transactions.filter(t => t.phaseId !== phaseId);
        project.updatedAt = Date.now();
        this.save(project);
    },

    // --- Transakcie ---
    addTransaction(projectId, phaseId, amount, description, category = 'material') {
        const project = this.get(projectId);
        if (!project) return;
        
        const transaction = {
            id: Store.generateId(),
            phaseId,
            amount: parseFloat(amount) || 0,
            description,
            category,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: Date.now()
        };
        
        project.transactions.push(transaction);
        project.updatedAt = Date.now();
        this.save(project);
        return transaction;
    },

    deleteTransaction(projectId, transactionId) {
        const project = this.get(projectId);
        if (!project) return;
        
        project.transactions = project.transactions.filter(t => t.id !== transactionId);
        project.updatedAt = Date.now();
        this.save(project);
    },

    // --- Štatistiky ---
    calculateStats(project) {
        const totalBudget = project.budget || 0;
        const totalSpent = project.transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        
        // Priemerný progres fáz
        const avgProgress = project.phases.length > 0 
            ? project.phases.reduce((sum, p) => sum + (p.progress || 0), 0) / project.phases.length 
            : 0;

        // Štatistiky podľa kategórií
        const categoryStats = {
            material: 0,
            labor: 0,
            transport: 0,
            other: 0
        };
        project.transactions.forEach(t => {
            const cat = t.category || 'material';
            if (categoryStats.hasOwnProperty(cat)) {
                categoryStats[cat] += parseFloat(t.amount || 0);
            } else {
                categoryStats.other += parseFloat(t.amount || 0);
            }
        });

        // Štatistiky podľa fáz
        const phaseStats = project.phases.map(phase => {
            const phaseSpent = project.transactions
                .filter(t => t.phaseId === phase.id)
                .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            
            const totalEstimated = phaseSpent + (parseFloat(phase.expectedExtra) || 0);

            return {
                ...phase,
                spent: phaseSpent,
                remaining: phase.budget - phaseSpent,
                isOverBudget: phaseSpent > phase.budget,
                isRisk: totalEstimated > phase.budget
            };
        });

        return {
            totalBudget,
            totalSpent,
            remaining: totalBudget - totalSpent,
            progress: Math.round(avgProgress),
            isOverBudget: totalSpent > totalBudget,
            categoryStats,
            phaseStats
        };
    },

    createEmpty(name = 'Nový projekt', type = 'house') {
        const now = new Date();
        const nextMonth = new Date();
        nextMonth.setMonth(now.getMonth() + 1);

        return {
            id: Store.generateId(),
            name,
            type,
            description: '',
            budget: 0,
            status: 'active',
            startDate: now.toISOString().split('T')[0],
            endDate: nextMonth.toISOString().split('T')[0],
            phases: [],
            transactions: [],
            createdAt: now.toISOString(),
            updatedAt: Date.now()
        };
    }
};

if (typeof module !== 'undefined') module.exports = Projects;
else window.Projects = Projects;
