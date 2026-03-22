// UI Helper Functions for ProjectTracker - Shared
const UIHelpers = {
    // Aktualizuje UI jednotlivé úlohy (prečiarknutie, farbu)
    updateTaskUI(taskId, task) {
        const taskTextEl = document.getElementById(`task-text-${taskId}`);
        if (taskTextEl) {
            if (task.completed) {
                taskTextEl.style.textDecoration = 'line-through';
                taskTextEl.style.color = 'var(--text-muted)';
            } else {
                taskTextEl.style.textDecoration = 'none';
                taskTextEl.style.color = '';
            }
        }
    },

    // Aktualizuje progress bar a text fázy
    updatePhaseProgressUI(phaseId, progress) {
        const barEl = document.getElementById(`phase-progress-bar-${phaseId}`);
        const textEl = document.getElementById(`phase-progress-text-${phaseId}`);
        if (barEl) barEl.style.width = `${progress}%`;
        if (textEl) textEl.textContent = `${progress}%`;
    },

    // Počíta progress z aktívnych úloh
    calculatePhaseProgress(phase) {
        if (!phase.tasks || phase.tasks.length === 0) return 0;
        const activeTasks = phase.tasks.filter(t => !t.deleted);
        if (activeTasks.length === 0) return 0;
        const completed = activeTasks.filter(t => t.completed).length;
        return Math.round((completed / activeTasks.length) * 100);
    },

    // Vyrenderuje HTML s úlohami (format: 'desktop' | 'mobile')
    renderTasksList(tasks, projectId, phaseId, format = 'desktop') {
        if (!tasks) tasks = [];
        const activeTasks = tasks.filter(t => !t.deleted);
        
        if (format === 'desktop') {
            return activeTasks.map(t => `
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                    <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="App.toggleTask('${projectId}', '${phaseId}', '${t.id}')">
                    <span id="task-text-${t.id}" style="flex: 1; font-size: 0.875rem; ${t.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${t.text}</span>
                    <button onclick="App.deleteTask('${projectId}', '${phaseId}', '${t.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            `).join('');
        } else if (format === 'mobile') {
            return activeTasks.map(t => `
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <label class="m-task" style="margin-bottom: 0; flex: 1; display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="App.toggleTask('${projectId}', '${phaseId}', '${t.id}')">
                        <span style="flex: 1; ${t.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${t.text}</span>
                    </label>
                    <button onclick="App.deleteTask('${projectId}', '${phaseId}', '${t.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.5rem; font-size: 1rem;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }
        return '';
    },

    // Aktualizuje celkové štatistiky projektu v UI
    updateProjectStats(projectId) {
        const project = Projects.get(projectId);
        if (!project) return;
        
        const stats = Projects.calculateStats(project);
        const totalStatsEl = document.getElementById('project-total-stats');
        const totalProgressEl = document.getElementById('project-progress-text');
        
        if (totalStatsEl) totalStatsEl.textContent = `${stats.totalSpent.toLocaleString()} / ${stats.totalBudget.toLocaleString()} €`;
        if (totalProgressEl) totalProgressEl.textContent = `${stats.progress}% hotovo`;
    }
};
