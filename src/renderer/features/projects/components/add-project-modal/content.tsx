import { ChevronsUpDownIcon } from 'lucide-react';
import { useId } from 'react';
import { GithubAuthDisclaimer } from '@renderer/features/integrations/components/github-auth-disclaimer';
import { ComboboxTrigger, ComboboxValue } from '@renderer/lib/ui/combobox';
import { ComboboxPopover } from '@renderer/lib/ui/combobox-popover';
import { Field, FieldGroup, FieldLabel } from '@renderer/lib/ui/field';
import { Input } from '@renderer/lib/ui/input';
import { Label } from '@renderer/lib/ui/label';
import { RadioGroup, RadioGroupItem } from '@renderer/lib/ui/radio-group';
import { Separator } from '@renderer/lib/ui/separator';
import { type Strategy } from './add-project-modal';
import { LocalDirectorySelector } from './local-directory-selector';
import { type CloneModeState, type NewModeState, type PickModeState } from './modes';
import { RemoteDirectorySelector } from './remote-directory-selector';

export function PickExistingPanel({
  strategy,
  connectionId,
  state,
}: {
  strategy: Strategy;
  connectionId?: string;
  state: PickModeState;
}) {
  const nameId = useId();
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Folder</FieldLabel>
        {strategy === 'local' ? (
          <LocalDirectorySelector
            path={state.path}
            onPathChange={state.handlePathChange}
            title="Select a folder"
            message="Select a folder to open as a workspace"
          />
        ) : (
          <RemoteDirectorySelector
            connectionId={connectionId}
            value={state.path}
            onChange={state.handlePathChange}
          />
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={nameId}>Workspace Name</FieldLabel>
        <Input
          id={nameId}
          placeholder="Enter a workspace name"
          value={state.name}
          onChange={(e) => state.handleNameChange(e.target.value)}
        />
      </Field>
    </FieldGroup>
  );
}

export function CreateNewPanel({
  strategy,
  connectionId,
  state,
  showGithubAuthDisclaimer,
  onOpenAccountSettings,
}: {
  strategy: Strategy;
  connectionId?: string;
  state: NewModeState;
  showGithubAuthDisclaimer: boolean;
  onOpenAccountSettings: () => void;
}) {
  const repositoryNameId = useId();
  const projectNameId = useId();

  if (showGithubAuthDisclaimer) {
    return <GithubAuthDisclaimer onOpenAccountSettings={onOpenAccountSettings} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={repositoryNameId}>Repository Name</FieldLabel>
          <Input
            id={repositoryNameId}
            autoFocus
            placeholder="Enter a repository name"
            value={state.repositoryName}
            onChange={(e) => state.handleRepositoryNameChange(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Owner</FieldLabel>
          <ComboboxPopover
            trigger={
              <ComboboxTrigger
                render={
                  <button className="flex h-9 w-full min-w-0 items-center justify-between rounded-md border border-border px-2.5 py-1 text-left text-sm outline-none">
                    <ComboboxValue />
                    <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0" />
                  </button>
                }
              />
            }
            items={state.owners}
            defaultValue={state.repositoryOwner}
            value={state.repositoryOwner ?? null}
            onValueChange={state.handleOwnerChange}
          />
        </Field>
        <Field>
          <FieldLabel>Privacy</FieldLabel>
          <RadioGroup
            value={state.repositoryVisibility}
            onValueChange={(value) => state.setRepositoryVisibility(value as 'public' | 'private')}
          >
            <Label className="flex cursor-pointer items-center gap-3 font-normal">
              <RadioGroupItem value="private" />
              Private
            </Label>
            <Label className="flex cursor-pointer items-center gap-3 font-normal">
              <RadioGroupItem value="public" />
              Public
            </Label>
          </RadioGroup>
        </Field>
      </FieldGroup>
      <Separator className="w-full" />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={projectNameId}>Workspace Name</FieldLabel>
          <Input
            id={projectNameId}
            placeholder="Enter a workspace name"
            value={state.name}
            onChange={(e) => state.handleNameChange(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{strategy === 'local' ? 'Folder' : 'Remote Directory'}</FieldLabel>
          {strategy === 'local' ? (
            <LocalDirectorySelector
              path={state.path}
              onPathChange={state.setPath}
              title="Select a folder"
              message="Select a folder to open as a workspace"
            />
          ) : (
            <RemoteDirectorySelector
              connectionId={connectionId}
              value={state.path}
              onChange={state.setPath}
            />
          )}
        </Field>
      </FieldGroup>
    </div>
  );
}

export function ClonePanel({
  strategy,
  connectionId,
  state,
}: {
  strategy: Strategy;
  connectionId?: string;
  state: CloneModeState;
}) {
  const repositoryUrlId = useId();
  const projectNameId = useId();
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={repositoryUrlId}>Repository URL</FieldLabel>
          <Input
            id={repositoryUrlId}
            autoFocus
            placeholder="Enter a repository URL"
            value={state.repositoryUrl}
            onChange={(e) => state.handleRepositoryUrlChange(e.target.value)}
          />
        </Field>
      </FieldGroup>
      <Separator className="w-full" />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={projectNameId}>Workspace Name</FieldLabel>
          <Input
            id={projectNameId}
            placeholder="Enter a workspace name"
            value={state.name}
            onChange={(e) => state.handleNameChange(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{strategy === 'local' ? 'Folder' : 'Remote Directory'}</FieldLabel>
          {strategy === 'local' ? (
            <LocalDirectorySelector
              path={state.path}
              onPathChange={state.setPath}
              title="Select a folder"
              message="Select a folder to open as a workspace"
            />
          ) : (
            <RemoteDirectorySelector
              connectionId={connectionId}
              value={state.path}
              onChange={state.setPath}
            />
          )}
        </Field>
      </FieldGroup>
    </div>
  );
}
