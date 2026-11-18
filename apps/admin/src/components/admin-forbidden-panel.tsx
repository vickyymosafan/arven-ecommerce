import { LinkButton, StatusBanner, Surface } from '@arven/ui';

export interface AdminForbiddenPanelProps {
  title?: string;
  description: string;
}

export function AdminForbiddenPanel({
  title = '403 Forbidden: Access Restricted',
  description,
}: AdminForbiddenPanelProps) {
  return (
    <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
      <StatusBanner tone="danger" title={title} description={description} />
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton href="/" variant="secondary" size="md">
          Return to Overview
        </LinkButton>
      </div>
    </Surface>
  );
}
