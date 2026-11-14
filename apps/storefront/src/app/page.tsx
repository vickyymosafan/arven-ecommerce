import Link from 'next/link';
import { Badge, Divider, LinkButton, Surface } from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';

const foundationModules = [
  {
    code: '01 / IDENTITY',
    title: 'Customer Credentials & Verification',
    summary:
      'Register with strict password requirements, verify email ownership via one-time token, and manage recovery without exposing account state.',
    href: '/auth/register',
    actionLabel: 'Create Account',
  },
  {
    code: '02 / LOGISTICS',
    title: 'Delivery Address Book',
    summary:
      'Maintain Indonesian shipping destinations, recipient contacts, and a single default delivery address ready for future checkout phases.',
    href: '/account/addresses',
    actionLabel: 'Manage Addresses',
  },
  {
    code: '03 / GOVERNANCE',
    title: 'Active Session Controls',
    summary:
      'Inspect active browser sessions with Asia/Jakarta timestamps, masked network addresses, and single-click device revocation.',
    href: '/account/sessions',
    actionLabel: 'Review Sessions',
  },
] as const;

export default function StorefrontHomePage() {
  return (
    <StorefrontShell>
      <div className="space-y-12">
        <section className="grid gap-8 border-b border-hairline pb-12 lg:grid-cols-12 lg:items-end">
          <div className="space-y-5 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="info">Phase 02 Foundation</Badge>
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                Storefront Customer Portal
              </span>
            </div>

            <h1 className="font-display text-4xl font-normal leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
              Beyond Trends.
              <br />
              Beyond Time.
            </h1>

            <p className="max-w-[var(--container-prose)] text-base leading-relaxed text-ink-secondary">
              ARVEN is a contemporary luxury house built around measured proportion and durable craft.
              This foundation release establishes your clientele account, verified identity, saved
              addresses, and active session controls ahead of seasonal catalog openings.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <LinkButton href="/auth/login" variant="primary" size="lg">
                Sign In to Account
              </LinkButton>
              <LinkButton href="/auth/register" variant="secondary" size="lg">
                Create Clientele Account
              </LinkButton>
              <LinkButton href="/account" variant="ghost" size="lg">
                Profile Console
              </LinkButton>
            </div>
          </div>

          <div className="lg:col-span-4">
            <Surface variant="panel" border="control" padding="md" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                  Portal Release Scope
                </span>
                <Badge tone="success">Live</Badge>
              </div>
              <Divider />
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Account Identity</dt>
                  <dd className="font-mono text-xs text-ink">Active</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Address Book</dt>
                  <dd className="font-mono text-xs text-ink">Active</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Session Controls</dt>
                  <dd className="font-mono text-xs text-ink">Active</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Catalog &amp; Bag</dt>
                  <dd className="font-mono text-xs text-ink-muted">Upcoming Phase</dd>
                </div>
              </dl>
            </Surface>
          </div>
        </section>

        <section aria-labelledby="capabilities-heading" className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                Available Now
              </p>
              <h2
                id="capabilities-heading"
                className="font-display text-2xl font-normal tracking-[-0.015em] text-ink sm:text-3xl"
              >
                Clientele Services
              </h2>
            </div>
            <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline">
              Open Account Workspace
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {foundationModules.map((item) => (
              <Surface
                key={item.code}
                variant="elevated"
                border="hairline"
                padding="md"
                className="flex flex-col justify-between gap-6"
              >
                <div className="space-y-3">
                  <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                    {item.code}
                  </p>
                  <h3 className="font-display text-2xl font-normal leading-snug text-ink">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ink-muted">{item.summary}</p>
                </div>

                <div>
                  <LinkButton href={item.href} variant="secondary" size="sm">
                    {item.actionLabel}
                  </LinkButton>
                </div>
              </Surface>
            ))}
          </div>
        </section>
      </div>
    </StorefrontShell>
  );
}
