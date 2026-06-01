import { GitBranch, type LucideIcon } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useArrowKeyNavigation } from '@renderer/lib/hooks/use-arrow-key-navigation';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { ActionListItem } from '@renderer/lib/ui/action-list-item';

type TaskStrategy = 'from-branch';

interface TaskAction {
  label: string;
  description: string;
  icon: LucideIcon;
  strategy: TaskStrategy;
  disabled: boolean;
  disabledReason?: string;
}

export const TaskListEmptyState = observer(function TaskListEmptyState({
  projectId,
}: {
  projectId: string;
}) {
  const showTaskModal = useShowModal('taskModal');

  const actions: TaskAction[] = [
    {
      label: 'Create a Task from a Branch',
      description: 'Create a task from an existing branch',
      icon: GitBranch,
      strategy: 'from-branch',
      disabled: false,
    },
  ];

  const { selectedIndex, setSelectedIndex } = useArrowKeyNavigation(actions.length, (index) => {
    const action = actions[index];
    if (action && !action.disabled) showTaskModal({ projectId, strategy: action.strategy });
  });

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background p-8">
      <div className="flex w-full max-w-sm flex-col gap-1">
        {actions.map((action, i) => (
          <ActionListItem
            key={action.strategy}
            label={action.label}
            description={action.description}
            icon={action.icon}
            isSelected={i === selectedIndex}
            disabled={action.disabled}
            disabledReason={action.disabledReason}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => {
              if (!action.disabled) showTaskModal({ projectId, strategy: action.strategy });
            }}
          />
        ))}
      </div>
    </div>
  );
});
