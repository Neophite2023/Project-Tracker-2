// Task Helper Functions for ProjectTracker - Shared
const TaskHelpers = {
    // Spracuje toggle (completed/not completed) úlohy
    handleToggleTask(projectId, phaseId, taskId) {
        // Zmení stav úlohy v data modele (automaticky volá Projects.save)
        Projects.toggleTask(projectId, phaseId, taskId);
        
        // Nájde úlohu a aktualizuje jej UI
        const project = Projects.get(projectId);
        const phase = project.phases.find(p => p.id === phaseId);
        const task = phase.tasks.find(t => t.id === taskId);
        
        // Aktualizuje UI
        UIHelpers.updateTaskUI(taskId, task);
        
        // Aktualizuje progress fázy
        const progress = UIHelpers.calculatePhaseProgress(phase);
        UIHelpers.updatePhaseProgressUI(phaseId, progress);
        
        // Aktualizuje celkové štatistiky
        UIHelpers.updateProjectStats(projectId);
    },

    // Spracuje vymazanie úlohy
    handleDeleteTask(projectId, phaseId, taskId) {
        // Vymaže úlohu v data modele (automaticky volá Projects.save)
        Projects.deleteTask(projectId, phaseId, taskId);
        
        // Nájde fázu a aktualizuje jej UI
        const project = Projects.get(projectId);
        const phase = project.phases.find(p => p.id === phaseId);
        
        // Odstráni úlohu z DOM
        const taskElement = document.getElementById(`task-${taskId}`);
        if (taskElement) taskElement.remove();
        
        // Aktualizuje progress fázy
        const progress = UIHelpers.calculatePhaseProgress(phase);
        UIHelpers.updatePhaseProgressUI(phaseId, progress);
        
        // Aktualizuje celkové štatistiky
        UIHelpers.updateProjectStats(projectId);
    }
};
