const Projects = {
    getAll() {
        return Store.getProjects().filter(p => !p.deleted);
    },

    get(id) {
        return Store.getProjects().find(p => p.id === id);
    },

    _nextUpdatedAt(current = 0) {
        const currentTs = Number(current) || 0;
        return Math.max(Date.now(), currentTs + 1);
    },

    save(project, skipUpdatedAt = false) {
        const projects = Store.getProjects();
        const index = projects.findIndex(p => p.id === project.id);
        
        if (!skipUpdatedAt) {
            project.updatedAt = this._nextUpdatedAt(project.updatedAt);
        }
        
        if (index !== -1) projects[index] = project;
        else {
            project.createdAt = project.createdAt || new Date().toISOString();
            project.updatedAt = project.updatedAt || this._nextUpdatedAt();
            projects.push(project);
        }
        
        Store.saveProjects(projects);
    },

    delete(id) {
        const project = this.get(id);
        if (project) {
            project.deleted = true;
            project.updatedAt = this._nextUpdatedAt(project.updatedAt);
            this.save(project);
        }
    },

    // --- Fázy ---
    addPhase(projectId, name, budget) {
        const project = this.get(projectId);
        if (!project) return;

        if (!Array.isArray(project.phases)) project.phases = [];
        
        const phase = {
            id: Store.generateId(),
            name,
            budget: parseFloat(budget) || 0,
            progress: 0,
            tasks: [],
            notes: '',
            expectedExtra: 0,
            createdAt: new Date().toISOString(),
            updatedAt: this._nextUpdatedAt()
        };
        
        project.phases.push(phase);
        project.updatedAt = this._nextUpdatedAt(project.updatedAt);
        this.save(project);
        return phase;
    },

    updatePhase(projectId, phaseId, data) {
        const project = this.get(projectId);
        if (!project) return;
        
        const phase = project.phases.find(p => p.id === phaseId);
        if (phase) {
            Object.assign(phase, data);
            phase.updatedAt = this._nextUpdatedAt(phase.updatedAt);
            
            // Ak sa zmenili úlohy, prepočítame progres automaticky
            if (phase.tasks && phase.tasks.length > 0) {
                const activeTasks = phase.tasks.filter(t => !t.deleted);
                if (activeTasks.length > 0) {
                    const completed = activeTasks.filter(t => t.completed).length;
                    phase.progress = Math.round((completed / activeTasks.length) * 100);
                } else {
                    phase.progress = 0;
                }
            }
            
            project.updatedAt = this._nextUpdatedAt(project.updatedAt);
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
            updatedAt: this._nextUpdatedAt()
        });
        
        phase.updatedAt = this._nextUpdatedAt(phase.updatedAt);
        project.updatedAt = this._nextUpdatedAt(project.updatedAt);
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
            task.updatedAt = this._nextUpdatedAt(task.updatedAt);
            phase.updatedAt = this._nextUpdatedAt(phase.updatedAt);
            project.updatedAt = this._nextUpdatedAt(project.updatedAt);
            this.save(project);
        }
    },

    deleteTask(projectId, phaseId, taskId) {
        const project = this.get(projectId);
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase || !phase.tasks) return;

        const task = phase.tasks.find(t => t.id === taskId);
        if (task) {
            task.deleted = true;
            task.updatedAt = this._nextUpdatedAt(task.updatedAt);
            phase.updatedAt = this._nextUpdatedAt(phase.updatedAt);
            
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
            
            project.updatedAt = this._nextUpdatedAt(project.updatedAt);
            this.save(project);
        }
    },

    deletePhase(projectId, phaseId) {
        const project = this.get(projectId);
        if (!project) return;
        
        const phase = project.phases.find(p => p.id === phaseId);
        if (phase) {
            phase.deleted = true;
            phase.updatedAt = this._nextUpdatedAt(phase.updatedAt);
            project.updatedAt = this._nextUpdatedAt(project.updatedAt);
            this.save(project);
        }
    },

    // --- Transakcie ---
    addTransaction(projectId, phaseId, amount, description, category = 'material') {
        const project = this.get(projectId);
        if (!project) return;

        if (!Array.isArray(project.transactions)) project.transactions = [];
        
        const transaction = {
            id: Store.generateId(),
            phaseId,
            amount: parseFloat(amount) || 0,
            description,
            category,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: this._nextUpdatedAt()
        };
        
        project.transactions.push(transaction);
        project.updatedAt = this._nextUpdatedAt(project.updatedAt);
        this.save(project);
        return transaction;
    },

    deleteTransaction(projectId, transactionId) {
        const project = this.get(projectId);
        if (!project) return;
        
        const transaction = project.transactions.find(t => t.id === transactionId);
        if (transaction) {
            transaction.deleted = true;
            transaction.updatedAt = this._nextUpdatedAt(transaction.updatedAt);
            project.updatedAt = this._nextUpdatedAt(project.updatedAt);
            this.save(project);
        }
    },

    // --- Štatistiky ---
    calculateStats(project) {
        const totalBudget = project.budget || 0;
        const activeTransactions = (project.transactions || []).filter(t => !t.deleted);
        const totalSpent = activeTransactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        
        const activePhases = (project.phases || []).filter(p => !p.deleted);

        // Štatistiky podľa fáz
        const phaseStats = activePhases.map(phase => {
            const phaseSpent = activeTransactions
                .filter(t => t.phaseId === phase.id)
                .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            
            const totalEstimated = phaseSpent + (parseFloat(phase.expectedExtra) || 0);

            // Filtrovanie zmazaných úloh a prepočet priebehu z aktívnych úloh
            const activeTasks = (phase.tasks || []).filter(t => !t.deleted);
            let phaseProgress = 0;
            if (activeTasks.length > 0) {
                const completedTasks = activeTasks.filter(t => t.completed).length;
                phaseProgress = Math.round((completedTasks / activeTasks.length) * 100);
            }

            return {
                ...phase,
                progress: phaseProgress, // Prepočítaný progres z aktívnych úloh
                tasks: activeTasks, // Upravené pre zobrazenie
                spent: phaseSpent,
                remaining: phase.budget - phaseSpent,
                isOverBudget: phaseSpent > phase.budget,
                isRisk: totalEstimated > phase.budget
            };
        });

        // Priemerný progres fáz z prepočítaných hodnôt
        const avgProgress = phaseStats.length > 0
            ? phaseStats.reduce((sum, p) => sum + (p.progress || 0), 0) / phaseStats.length
            : 0;

        // Štatistiky podľa kategórií
        const categoryStats = {
            material: 0,
            labor: 0,
            transport: 0,
            other: 0
        };
        activeTransactions.forEach(t => {
            const cat = t.category || 'material';
            if (categoryStats.hasOwnProperty(cat)) {
                categoryStats[cat] += parseFloat(t.amount || 0);
            } else {
                categoryStats.other += parseFloat(t.amount || 0);
            }
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
            updatedAt: this._nextUpdatedAt()
        };
    }
};

if (typeof module !== 'undefined') module.exports = Projects;
else window.Projects = Projects;
