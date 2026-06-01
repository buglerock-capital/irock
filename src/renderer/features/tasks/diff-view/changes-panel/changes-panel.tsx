import { observer } from 'mobx-react-lite';
import { useWorkspace, useWorkspaceViewModel } from '@renderer/features/tasks/task-view-context';

export const ChangesPanel = observer(function ChangesPanel() {
  const taskView = useWorkspaceViewModel();
  const workspace = useWorkspace();
  const diffView = taskView.diffView;
  const changesView = diffView?.changesView;

  if (!diffView || !changesView || !workspace.git.hasData) return null;

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <p className="text-sm text-foreground-muted">Changes are managed automatically.</p>
    </div>
  );
});
