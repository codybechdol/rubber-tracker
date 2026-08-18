/**
 * tasks.js - Offline Tasks & Calendar Management
 */

class TaskManagerApp {
  constructor(db) {
    this.db = db;
    this.filterStatus = 'All';
    this.searchTerm = '';
  }

  init() {
    this.renderTasks();
  }

  renderTasks() {
    const container = document.getElementById('tasks-list-container');
    const badge = document.getElementById('tasks-total-badge');
    if (!container) return;

    const taskTable = this.db.getTable('task_metadata');
    const rows = taskTable.rows || [];

    let filtered = rows;
    if (this.filterStatus !== 'All') {
      filtered = filtered.filter(t => String(t['Status'] || '').toLowerCase() === this.filterStatus.toLowerCase());
    }

    if (badge) badge.textContent = `${filtered.length} tasks`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <h3>No tasks match the current filter</h3>
          <p style="margin-top: 8px;">All tasks are up to date or synced.</p>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.forEach(task => {
      const taskId = task['Task ID'] || 'N/A';
      const type = task['Task Type'] || task['Source Sheet'] || 'Equipment Swap';
      const location = task['Location'] || 'Unknown';
      const assignedTo = task['Assigned Worker'] || task['Employee'] || 'Unassigned';
      const dueDate = task['Due Date'] || task['Scheduled Date'] || 'N/A';
      const status = task['Status'] || 'Unassigned';
      const isComplete = status.toLowerCase() === 'complete';

      html += `
        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-left: 4px solid ${isComplete ? 'var(--success)' : 'var(--warning)'}; border-radius: 8px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 15px;">${type}</span>
              <span class="brand-badge" style="background-color: var(--bg-tertiary); border: none; color: var(--text-secondary);">${location}</span>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary);">
              Assigned to: <strong style="color: var(--text-primary);">${assignedTo}</strong> &nbsp;|&nbsp; 
              Due Date: <strong>${dueDate}</strong>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 12px; font-weight: 600; color: ${isComplete ? 'var(--success)' : 'var(--warning)'};">
              ${status}
            </span>
            ${!isComplete ? `
              <button class="btn" style="background-color: var(--success); padding: 6px 12px; font-size: 12px;" onclick="window.taskManager.completeTask('${taskId}')">
                ✓ Mark Complete
              </button>
            ` : `
              <span style="color: var(--text-muted); font-size: 12px;">✓ Completed</span>
            `}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  completeTask(taskId) {
    const todayStr = new Date().toISOString().split('T')[0];

    // Optimistically update local database
    this.db.addMutation({
      action: 'SET_TASK_STATUS',
      taskId: taskId,
      status: 'Complete',
      completedDate: todayStr
    });

    this.renderTasks();
  }
}

window.taskManager = new TaskManagerApp(window.localDB);
