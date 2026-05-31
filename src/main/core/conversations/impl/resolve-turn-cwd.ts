import { eq } from 'drizzle-orm';
import { projectManager } from '@main/core/projects/project-manager';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';

/**
 * Resolve the worktree working-directory for a task.
 *
 * Reuses the same path-resolution chain as getDeletePreflight:
 *   1. Load task.taskBranch and task.projectId from the DB.
 *   2. Retrieve the live ProjectProvider via projectManager.
 *   3. Ask the provider's WorktreeService for the checked-out worktree path.
 *
 * Throws if the task is not found, has no branch, the project is not open,
 * or no worktree exists for the branch.
 */
export async function resolveTurnCwd(taskId: string): Promise<string> {
  const [task] = await db
    .select({ projectId: tasks.projectId, taskBranch: tasks.taskBranch })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    throw new Error(`resolveTurnCwd: task ${taskId} not found`);
  }

  if (!task.taskBranch) {
    throw new Error(`resolveTurnCwd: task ${taskId} has no taskBranch`);
  }

  const project = projectManager.getProject(task.projectId);
  if (!project) {
    throw new Error(`resolveTurnCwd: project ${task.projectId} is not open (task ${taskId})`);
  }

  const worktreePath = await project.worktreeService.getWorktree(task.taskBranch);
  if (!worktreePath) {
    throw new Error(
      `resolveTurnCwd: no worktree found for branch ${task.taskBranch} (task ${taskId})`
    );
  }

  return worktreePath;
}
