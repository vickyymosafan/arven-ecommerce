'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AddressResponse } from '@arven/contracts';
import { createAddressRequestSchema, updateAddressRequestSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  StatusBanner,
  Surface,
  useToast,
} from '@arven/ui';
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, extractFieldErrors, storefrontApi } from '@/lib/api-client';

interface AddressFormState {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

const emptyFormState: AddressFormState = {
  label: '',
  recipientName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'ID',
  isDefault: false,
};

function mapAddressToForm(address: AddressResponse): AddressFormState {
  return {
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    province: address.province,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault,
  };
}

export default function CustomerAddressesPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [addresses, setAddresses] = useState<AddressResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressResponse | null>(null);
  const [formState, setFormState] = useState<AddressFormState>(emptyFormState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const [deletingTarget, setDeletingTarget] = useState<AddressResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const items = await storefrontApi.listAddresses();
      setAddresses(items);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        router.replace('/auth/login?next=/account/addresses');
        return;
      }
      if (err instanceof ApiClientError) {
        setLoadError({ message: err.message, requestId: err.requestId });
      } else {
        setLoadError({ message: 'Unable to load your saved addresses right now.' });
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    storefrontApi
      .listAddresses()
      .then((items) => {
        if (active) {
          setAddresses(items);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace('/auth/login?next=/account/addresses');
          return;
        }
        if (err instanceof ApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load your saved addresses right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  const openCreateModal = () => {
    setEditingAddress(null);
    setFormState({ ...emptyFormState, isDefault: addresses.length === 0 });
    setFieldErrors({});
    setModalError(null);
    setEditorOpen(true);
  };

  const openEditModal = (address: AddressResponse) => {
    setEditingAddress(address);
    setFormState(mapAddressToForm(address));
    setFieldErrors({});
    setModalError(null);
    setEditorOpen(true);
  };

  const handleSaveAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError(null);
    setFieldErrors({});

    const normalizedCountry = formState.country.trim().toUpperCase() || 'ID';
    const rawPayload = {
      label: formState.label.trim(),
      recipientName: formState.recipientName.trim(),
      phone: formState.phone.trim(),
      line1: formState.line1.trim(),
      ...(formState.line2.trim() ? { line2: formState.line2.trim() } : {}),
      city: formState.city.trim(),
      province: formState.province.trim(),
      postalCode: formState.postalCode.trim(),
      country: normalizedCountry,
      isDefault: formState.isDefault,
    };

    if (editingAddress) {
      const updatePayload = {
        ...rawPayload,
        line2: formState.line2.trim() ? formState.line2.trim() : undefined,
      };
      const parsed = updateAddressRequestSchema.safeParse(updatePayload);
      if (!parsed.success) {
        const nextErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          if (!nextErrors[key]) {
            nextErrors[key] = issue.message;
          }
        }
        setFieldErrors(nextErrors);
        return;
      }

      setSaving(true);
      try {
        await storefrontApi.updateAddress(editingAddress.id, parsed.data);
        setEditorOpen(false);
        toast({
          tone: 'success',
          title: 'Address updated',
          description: `${rawPayload.label} has been saved.`,
        });
        await loadAddresses();
      } catch (err) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace('/auth/login?next=/account/addresses');
          return;
        }
        if (err instanceof ApiClientError) {
          setFieldErrors(extractFieldErrors(err));
          setModalError({ message: err.message, requestId: err.requestId });
        } else {
          setModalError({ message: 'Unable to save this address right now.' });
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    const parsed = createAddressRequestSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await storefrontApi.createAddress(parsed.data);
      setEditorOpen(false);
      toast({
        tone: 'success',
        title: 'Address added',
        description: `${rawPayload.label} has been added to your address book.`,
      });
      await loadAddresses();
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        router.replace('/auth/login?next=/account/addresses');
        return;
      }
      if (err instanceof ApiClientError) {
        setFieldErrors(extractFieldErrors(err));
        setModalError({ message: err.message, requestId: err.requestId });
      } else {
        setModalError({ message: 'Unable to create this address right now.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (address: AddressResponse) => {
    setActionBusyId(address.id);
    try {
      await storefrontApi.updateAddress(address.id, { isDefault: true });
      toast({
        tone: 'success',
        title: 'Default address updated',
        description: `${address.label} is now your default delivery address.`,
      });
      await loadAddresses();
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast({ tone: 'danger', title: 'Unable to set default address', description: err.message });
      }
    } finally {
      setActionBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTarget) {
      return;
    }
    setDeleting(true);
    try {
      await storefrontApi.deleteAddress(deletingTarget.id);
      toast({
        tone: 'success',
        title: 'Address removed',
        description: `${deletingTarget.label} has been deleted.`,
      });
      setDeletingTarget(null);
      await loadAddresses();
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast({ tone: 'danger', title: 'Delete failed', description: err.message });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AccountShell
      title="Address Book"
      description="Maintain saved delivery addresses and choose your default shipping destination."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {addresses.length} {addresses.length === 1 ? 'saved address' : 'saved addresses'}
          </p>
          <Button type="button" variant="primary" onClick={openCreateModal}>
            Add Delivery Address
          </Button>
        </div>

        {loading ? (
          <LoadingState label="Loading saved addresses" rows={3} />
        ) : loadError ? (
          <ErrorState
            title="Could not load addresses"
            message={loadError.message}
            requestId={loadError.requestId}
            onRetry={() => void loadAddresses()}
          />
        ) : addresses.length === 0 ? (
          <EmptyState
            title="No saved delivery addresses yet"
            description="Add a primary home, studio, or office address to store your Indonesian shipping details cleanly."
            action={
              <Button type="button" variant="primary" onClick={openCreateModal}>
                Add First Address
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {addresses.map((address) => (
              <Surface
                key={address.id}
                variant="elevated"
                border={address.isDefault ? 'strong' : 'hairline'}
                padding="md"
                className="flex flex-col justify-between gap-5"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-2xl font-normal text-ink">{address.label}</h2>
                    {address.isDefault ? <Badge tone="info">Default</Badge> : null}
                  </div>
                  <div className="space-y-1 text-sm text-ink-secondary">
                    <p className="font-medium text-ink">{address.recipientName}</p>
                    <p className="font-mono text-xs text-ink-muted">{address.phone}</p>
                    <p>{address.line1}</p>
                    {address.line2 ? <p>{address.line2}</p> : null}
                    <p>
                      {address.city}, {address.province} {address.postalCode}
                    </p>
                    <p className="font-mono text-xs uppercase text-ink-muted">{address.country}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditModal(address)}
                  >
                    Edit
                  </Button>
                  {!address.isDefault ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      isLoading={actionBusyId === address.id}
                      loadingLabel="Updating"
                      onClick={() => void handleSetDefault(address)}
                    >
                      Set Default
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setDeletingTarget(address)}
                  >
                    Delete
                  </Button>
                </div>
              </Surface>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingAddress ? 'Edit Delivery Address' : 'Add Delivery Address'}
        description="Provide recipient contact and full Indonesian delivery destination details."
        size="lg"
      >
        <form onSubmit={handleSaveAddress} noValidate className="space-y-4">
          {modalError ? (
            <StatusBanner
              tone="danger"
              title="Could not save address"
              description={modalError.message}
              requestId={modalError.requestId}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="addr-label" label="Address Label" error={fieldErrors['label']} required>
              <Input
                id="addr-label"
                placeholder="Home or Studio"
                value={formState.label}
                onChange={(event) => setFormState((prev) => ({ ...prev, label: event.target.value }))}
                invalid={Boolean(fieldErrors['label'])}
              />
            </FormField>

            <FormField
              id="addr-recipient"
              label="Recipient Name"
              error={fieldErrors['recipientName']}
              required
            >
              <Input
                id="addr-recipient"
                value={formState.recipientName}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, recipientName: event.target.value }))
                }
                invalid={Boolean(fieldErrors['recipientName'])}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="addr-phone" label="Phone Number" error={fieldErrors['phone']} required>
              <Input
                id="addr-phone"
                type="tel"
                placeholder="+6281234567890"
                value={formState.phone}
                onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))}
                invalid={Boolean(fieldErrors['phone'])}
              />
            </FormField>

            <FormField
              id="addr-country"
              label="Country Code"
              hint="2-letter ISO code (default ID)."
              error={fieldErrors['country']}
              required
            >
              <Input
                id="addr-country"
                maxLength={2}
                value={formState.country}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, country: event.target.value.toUpperCase() }))
                }
                invalid={Boolean(fieldErrors['country'])}
              />
            </FormField>
          </div>

          <FormField id="addr-line1" label="Street Address" error={fieldErrors['line1']} required>
            <Input
              id="addr-line1"
              value={formState.line1}
              onChange={(event) => setFormState((prev) => ({ ...prev, line1: event.target.value }))}
              invalid={Boolean(fieldErrors['line1'])}
            />
          </FormField>

          <FormField
            id="addr-line2"
            label="District / Unit / Notes (Optional)"
            error={fieldErrors['line2']}
          >
            <Input
              id="addr-line2"
              value={formState.line2}
              onChange={(event) => setFormState((prev) => ({ ...prev, line2: event.target.value }))}
              invalid={Boolean(fieldErrors['line2'])}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="addr-city" label="City" error={fieldErrors['city']} required>
              <Input
                id="addr-city"
                value={formState.city}
                onChange={(event) => setFormState((prev) => ({ ...prev, city: event.target.value }))}
                invalid={Boolean(fieldErrors['city'])}
              />
            </FormField>

            <FormField id="addr-province" label="Province" error={fieldErrors['province']} required>
              <Input
                id="addr-province"
                value={formState.province}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, province: event.target.value }))
                }
                invalid={Boolean(fieldErrors['province'])}
              />
            </FormField>

            <FormField
              id="addr-postal"
              label="Postal Code"
              error={fieldErrors['postalCode']}
              required
            >
              <Input
                id="addr-postal"
                value={formState.postalCode}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, postalCode: event.target.value }))
                }
                invalid={Boolean(fieldErrors['postalCode'])}
              />
            </FormField>
          </div>

          <Checkbox
            label="Set as default delivery address"
            description="Pre-selects this destination for future deliveries."
            checked={formState.isDefault}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, isDefault: event.target.checked }))
            }
          />

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving} loadingLabel="Saving address">
              {editingAddress ? 'Save Changes' : 'Add Address'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deletingTarget)}
        onClose={() => setDeletingTarget(null)}
        title="Delete Saved Address"
        description="This action permanently removes the selected delivery destination."
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeletingTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={deleting}
              loadingLabel="Deleting"
              onClick={() => void handleConfirmDelete()}
            >
              Delete Address
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-secondary">
          Are you sure you want to remove{' '}
          <strong className="font-semibold text-ink">{deletingTarget?.label}</strong>?
        </p>
      </Modal>
    </AccountShell>
  );
}
