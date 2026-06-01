import { observer } from 'mobx-react-lite';
import { useEffect, useRef } from 'react';
import { SettingsPanel } from '@renderer/features/projects/components/settings-view/settings-panel';
import { TaskList } from '@renderer/features/projects/components/task-view/task-list';
import {
  asMounted,
  getProjectStore,
  getRepositoryStore,
} from '@renderer/features/projects/stores/project-selectors';
import type { ProjectView } from '@renderer/features/projects/stores/project-view';
import { getTaskManagerStore } from '@renderer/features/tasks/stores/task-selectors';
import { useParams } from '@renderer/lib/layout/navigation-provider';
import { appState } from '@renderer/lib/stores/app-state';
import { log } from '@renderer/utils/logger';
import { cn } from '@renderer/utils/utils';

// Tracks projectIds that have already had an auto-provision attempt this session,
// preventing double-creates across re-renders.
const autoProvisionedProjects = new Set<string>();

const projectViewItems: Array<{ id: ProjectView; label: string }> = [
  { id: 'tasks', label: 'Conversations' },
  { id: 'settings', label: 'Settings' },
];

function ProjectViewNav({
  activeView,
  onChange,
}: {
  activeView: ProjectView;
  onChange: (view: ProjectView) => void;
}) {
  return (
    <div className="py-10">
      <nav className="flex min-h-0 w-52 flex-col gap-0.5 overflow-y-auto" aria-label="Project">
        {projectViewItems.map((item) => {
          const isActive = item.id === activeView;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-normal text-foreground-muted transition-colors hover:bg-background-1 hover:text-foreground',
                isActive &&
                  'bg-background-2 text-foreground hover:bg-background-2 hover:text-foreground'
              )}
            >
              <span className="truncate text-left">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export const ActiveProject = observer(function ActiveProject() {
  const {
    params: { projectId },
  } = useParams('project');
  const store = asMounted(getProjectStore(projectId));
  const taskManager = getTaskManagerStore(projectId);
  const repoStore = getRepositoryStore(projectId);

  // Snapshot MobX observable values so they are tracked by observer and can be
  // used as stable effect deps.
  const tasksLoaded = taskManager?.tasksLoaded ?? false;
  const taskCount = taskManager?.tasks.size ?? 0;
  const defaultBranch = repoStore?.defaultBranch;
  const currentBranch = repoStore?.currentBranch ?? null;
  const provisioningRef = useRef(false);

  // Auto-provision: when a workspace has zero tasks, silently create one with a
  // Claude conversation and navigate straight into chat.
  useEffect(() => {
    if (!store) return;
    if (!taskManager) return;
    if (!tasksLoaded) return;
    if (taskCount > 0) return;
    if (autoProvisionedProjects.has(projectId)) return;
    if (provisioningRef.current) return;

    // Resolve the source branch: prefer the repo defaultBranch, fall back to
    // currentBranch as a local branch, or use 'main' as a last resort.
    const sourceBranch = (() => {
      if (defaultBranch) return defaultBranch;
      if (currentBranch) return { type: 'local' as const, branch: currentBranch };
      return { type: 'local' as const, branch: 'main' };
    })();

    autoProvisionedProjects.add(projectId);
    provisioningRef.current = true;

    const taskId = crypto.randomUUID();
    const shortId = taskId.slice(0, 8);
    const taskBranch = `chat-${shortId}`;

    void taskManager
      .createTask({
        id: taskId,
        projectId,
        name: 'Chat',
        sourceBranch,
        strategy: { kind: 'new-branch', taskBranch },
        initialConversation: {
          id: crypto.randomUUID(),
          projectId,
          taskId,
          provider: 'claude',
          title: 'Chat',
        },
      })
      .then(() => {
        appState.navigation.navigate('task', { projectId, taskId });
      })
      .catch((err: unknown) => {
        log.warn('ActiveProject: auto-provision failed, falling back to task list', { err });
        autoProvisionedProjects.delete(projectId);
        provisioningRef.current = false;
      });
  }, [store, taskManager, tasksLoaded, taskCount, projectId, defaultBranch, currentBranch]);

  if (!store) return null;

  const activeView = store.view.activeView;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1060px] flex-col gap-6 px-8">
        <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] gap-8 overflow-hidden">
          <ProjectViewNav
            activeView={activeView}
            onChange={(view) => store.view.setProjectView(view)}
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col px-1 py-10">
              {activeView === 'tasks' && <TaskList />}
              {activeView === 'settings' && <SettingsPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
