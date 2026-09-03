import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  Box,
  Button,
  Divider,
  Field,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  TextInput,
  Textarea,
  Th,
  Thead,
  Tr,
  Typography,
  Alert,
} from '@strapi/design-system';
import { Layouts, Page, useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';
import WarningDialog from '../components/WarningDialog';
import {
  FIELD_MAP_LABELS,
  SYNC_ID_FIELD,
  attrsForSlot,
  suggestMapping,
  type AttrInfo,
  type ComponentInfo,
  type ContentTypeInfo,
  type ContentWriteMode,
  type DynamicZoneMap,
  type FieldMap,
} from '../utils/fieldMapping';

type Settings = {
  siteUrl: string;
  workspace: string;
  apiKey: string;
  firebaseUid: string;
  folderPair: string;
  contentTypeUid: string;
  fieldMap: FieldMap;
  contentMode: ContentWriteMode;
  dynamicZone: DynamicZoneMap;
  defaultPublishStatus: 'draft' | 'published';
  importChunkSize: number;
  insertApiUrl?: string;
};

type QueuePost = {
  id: string;
  sync_id: string;
  title: string;
  has_content: boolean;
  existsInStrapi?: boolean;
  documentId?: string;
};

type SyncedEntry = {
  documentId: string;
  syncId: string;
  title: string;
  status?: string;
};

type SyncLog = {
  documentId: string;
  source: string;
  status: string;
  message: string;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs?: number;
  createdAt?: string;
};

type MainTab = 'settings' | 'import-queue' | 'imported' | 'logs';

type PendingConfirm = {
  title: string;
  description: string;
  note: string;
  confirmLabel: string;
  variant: 'danger' | 'default' | 'secondary';
  run: () => Promise<void>;
};

const emptyFieldMap: FieldMap = {
  title: 'blogTitle',
  content: '',
  excerpt: '',
  syncId: SYNC_ID_FIELD,
  seoTitle: 'blogMetaTitle',
  seoDescription: 'blogMetaDescription',
  featuredImage: 'blogImage',
  publishedAt: 'blogDate',
  coverS3Key: '',
  slug: 'blogSlug',
};

const emptySettings: Settings = {
  siteUrl: '',
  workspace: '',
  apiKey: '',
  firebaseUid: '',
  folderPair: '',
  contentTypeUid: 'api::blog.blog',
  fieldMap: { ...emptyFieldMap },
  contentMode: 'dynamiczone',
  dynamicZone: {
    field: 'contentSection',
    component: 'element.blog-content',
    htmlField: 'blogContent',
  },
  defaultPublishStatus: 'published',
  importChunkSize: 5,
};

const NONE = '__none__';

const FieldSelect = ({
  label,
  hint,
  value,
  options,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  hint?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) => (
  <Field.Root name={label} hint={hint}>
    <Field.Label>{label}</Field.Label>
    <SingleSelect
      value={value || NONE}
      onChange={(v: string) => onChange(v === NONE ? '' : v)}
      placeholder="— not mapped —"
    >
      {allowEmpty && <SingleSelectOption value={NONE}>— not mapped —</SingleSelectOption>}
      {options.map((o) => (
        <SingleSelectOption key={o.value} value={o.value}>
          {o.label}
        </SingleSelectOption>
      ))}
      {value && !options.some((o) => o.value === value) && (
        <SingleSelectOption value={value}>{value} (missing on type)</SingleSelectOption>
      )}
    </SingleSelect>
    {hint ? <Field.Hint /> : null}
  </Field.Root>
);

const formatImportResult = (data: {
  message?: string;
  errors?: string[];
  missingSyncIds?: string[];
}) => {
  const parts = [data.message || ''];
  if (data.missingSyncIds?.length) {
    parts.push(`Missing from Brandstory: ${data.missingSyncIds.join(', ')}`);
  }
  if (data.errors?.length) {
    parts.push(`Errors: ${data.errors.join('; ')}`);
  }
  return parts.filter(Boolean).join('\n');
};

/** Normalize /synced-entries payloads across HMR / older server shapes. */
function normalizeSyncedPayload(raw: unknown): {
  entries: SyncedEntry[];
  trackedImportedIds: number;
} {
  if (Array.isArray(raw)) {
    return { entries: raw as SyncedEntry[], trackedImportedIds: 0 };
  }
  if (!raw || typeof raw !== 'object') {
    return { entries: [], trackedImportedIds: 0 };
  }
  const obj = raw as Record<string, unknown>;
  // Correct shape: { entries: SyncedEntry[], trackedImportedIds }
  if (Array.isArray(obj.entries)) {
    return {
      entries: obj.entries as SyncedEntry[],
      trackedImportedIds: Number(obj.trackedImportedIds) || 0,
    };
  }
  // Mismatch shape from stale controller wrapping: { entries: { entries, trackedImportedIds } }
  if (obj.entries && typeof obj.entries === 'object' && !Array.isArray(obj.entries)) {
    const nested = obj.entries as Record<string, unknown>;
    if (Array.isArray(nested.entries)) {
      return {
        entries: nested.entries as SyncedEntry[],
        trackedImportedIds: Number(nested.trackedImportedIds ?? obj.trackedImportedIds) || 0,
      };
    }
  }
  return { entries: [], trackedImportedIds: Number(obj.trackedImportedIds) || 0 };
}

const HomePage = () => {
  const { get, post, put } = useFetchClient();
  const apiPrefix = `/admin/${pluginId}`;

  const apiGet = async <T,>(path: string): Promise<T> => {
    const res = await get(`${apiPrefix}${path}`);
    return res.data as T;
  };
  const apiPost = async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await post(`${apiPrefix}${path}`, body ?? {});
    return res.data as T;
  };
  const apiPut = async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await put(`${apiPrefix}${path}`, body ?? {});
    return res.data as T;
  };

  const [tab, setTab] = useState<MainTab>('settings');
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [contentTypes, setContentTypes] = useState<ContentTypeInfo[]>([]);
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<{
    variant: 'success' | 'danger' | 'default';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [connStatus, setConnStatus] = useState('Not checked');
  const [queuePosts, setQueuePosts] = useState<QueuePost[]>([]);
  const [queueCounts, setQueueCounts] = useState<{
    total: number;
    new: number;
    update: number;
  } | null>(null);
  const [syncedEntries, setSyncedEntries] = useState<SyncedEntry[]>([]);
  const [trackedImportedIds, setTrackedImportedIds] = useState(0);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  const [selectedImportedIds, setSelectedImportedIds] = useState<string[]>([]);
  const [actionResult, setActionResult] = useState('');
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const show = (text: string, variant: 'success' | 'danger' | 'default' = 'default') => {
    setStatusMsg({ text, variant });
  };

  const selectedCt = useMemo(
    () => contentTypes.find((ct) => ct.uid === settings.contentTypeUid),
    [contentTypes, settings.contentTypeUid]
  );

  const dzFields = useMemo(
    () => (selectedCt?.attributes || []).filter((a) => a.type === 'dynamiczone'),
    [selectedCt]
  );

  const selectedDz = useMemo(
    () => dzFields.find((a) => a.name === settings.dynamicZone.field),
    [dzFields, settings.dynamicZone.field]
  );

  const dzComponents = useMemo(() => {
    const uids = selectedDz?.components || [];
    return components.filter((c) => uids.includes(c.uid));
  }, [components, selectedDz]);

  const selectedComponent = useMemo(
    () => components.find((c) => c.uid === settings.dynamicZone.component),
    [components, settings.dynamicZone.component]
  );

  const htmlFieldsOnComponent = useMemo(() => {
    const attrs = selectedComponent?.attributes || [];
    return attrs.filter((a) =>
      ['richtext', 'text', 'string', 'blocks', 'customField', 'json'].includes(a.type)
    );
  }, [selectedComponent]);

  const safeQueuePosts = Array.isArray(queuePosts) ? queuePosts : [];
  const safeSyncedEntries = Array.isArray(syncedEntries) ? syncedEntries : [];

  const queueSyncIds = useMemo(
    () => safeQueuePosts.map((p) => p.sync_id).filter(Boolean),
    [safeQueuePosts]
  );
  const importedSyncIds = useMemo(
    () => safeSyncedEntries.map((e) => e.syncId).filter(Boolean),
    [safeSyncedEntries]
  );

  const allQueueSelected =
    queueSyncIds.length > 0 && queueSyncIds.every((id) => selectedQueueIds.includes(id));
  const allImportedSelected =
    importedSyncIds.length > 0 &&
    importedSyncIds.every((id) => selectedImportedIds.includes(id));

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiGet<Settings>('/settings');
      setSettings({
        ...emptySettings,
        ...data,
        fieldMap: { ...emptyFieldMap, ...data.fieldMap },
        dynamicZone: {
          field: '',
          component: '',
          htmlField: '',
          ...data.dynamicZone,
        },
        contentMode: data.contentMode === 'dynamiczone' ? 'dynamiczone' : 'field',
      });
      if (data.folderPair) {
        setFolders((prev) =>
          prev.includes(data.folderPair) ? prev : [...prev, data.folderPair]
        );
      }
    } catch (e) {
      show(e instanceof Error ? e.message : 'Failed to load settings', 'danger');
    }
  }, [get]);

  const loadContentTypes = useCallback(async () => {
    try {
      const data = await apiGet<{
        contentTypes: ContentTypeInfo[];
        components: ComponentInfo[];
      }>('/content-types');
      setContentTypes(data.contentTypes || []);
      setComponents(data.components || []);
    } catch {
      // ignore
    }
  }, [get]);

  const loadLogs = useCallback(async () => {
    try {
      const data = await apiGet<{ logs: SyncLog[] }>('/logs');
      setLogs(data.logs || []);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Failed to load logs', 'danger');
    }
  }, [get]);

  const loadSyncedEntries = useCallback(async () => {
    try {
      const data = await apiGet<unknown>('/synced-entries?limit=200');
      const { entries, trackedImportedIds: tracked } = normalizeSyncedPayload(data);
      setSyncedEntries(entries);
      setTrackedImportedIds(tracked);
      setSelectedImportedIds((prev) =>
        prev.filter((id) => entries.some((e) => e.syncId === id))
      );
    } catch {
      setSyncedEntries([]);
      setTrackedImportedIds(0);
    }
  }, [get]);

  const fetchQueueSilent = useCallback(async () => {
    const data = await apiPost<{
      error?: string;
      posts?: QueuePost[];
      counts?: { total: number; new: number; update: number };
    }>('/fetch');
    if (data.error) {
      setQueuePosts([]);
      setQueueCounts(null);
      return data;
    }
    const posts = Array.isArray(data.posts) ? data.posts : [];
    setQueuePosts(posts);
    setQueueCounts(data.counts || null);
    setSelectedQueueIds((prev) => prev.filter((id) => posts.some((p) => p.sync_id === id)));
    return data;
  }, [post]);

  useEffect(() => {
    loadSettings();
    loadContentTypes();
  }, [loadSettings, loadContentTypes]);

  useEffect(() => {
    setActionResult('');
    if (tab === 'logs') loadLogs();
    if (tab === 'imported' || tab === 'import-queue') loadSyncedEntries();
  }, [tab, loadLogs, loadSyncedEntries]);

  const applyAutoMap = (uid: string, cts = contentTypes, comps = components) => {
    const ct = cts.find((c) => c.uid === uid);
    const suggested = suggestMapping(ct, comps);
    setSettings((s) => ({
      ...s,
      contentTypeUid: uid,
      fieldMap: suggested.fieldMap,
      contentMode: suggested.contentMode,
      dynamicZone: suggested.dynamicZone,
    }));
  };

  const onContentTypeChange = (uid: string) => {
    applyAutoMap(uid);
    show(`Mapped fields for ${uid}. Review dropdowns, then Save.`, 'success');
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const data = await apiPut<Settings>('/settings', settings);
      setSettings({
        ...emptySettings,
        ...data,
        fieldMap: { ...emptyFieldMap, ...data.fieldMap },
        dynamicZone: { field: '', component: '', htmlField: '', ...data.dynamicZone },
        contentMode: data.contentMode === 'dynamiczone' ? 'dynamiczone' : 'field',
      });
      show('Connection settings saved.', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Save failed', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setConnStatus('Checking…');
    try {
      const data = await apiPost<{ ok: boolean; message: string }>('/test-connection');
      setConnStatus(data.ok ? `Connected — ${data.message}` : `Failed — ${data.message}`);
      show(data.message, data.ok ? 'success' : 'danger');
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Connection test failed';
      const msg = /signal is aborted|aborted without reason|AbortError/i.test(raw)
        ? 'Request cancelled or timed out. Save settings, wait for reload to finish, then Test connection again.'
        : raw;
      setConnStatus(`Failed — ${msg}`);
      show(msg, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const loadFolders = async () => {
    setBusy(true);
    try {
      await apiPut('/settings', settings);
      const data = await apiPost<{ pairs?: string[]; error?: string }>('/folders');
      if (data.error) {
        show(data.error, 'danger');
        return;
      }
      const pairs = data.pairs || [];
      setFolders(pairs);
      show(pairs.length ? `${pairs.length} folder(s) loaded.` : 'No folders returned.', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Failed to load folders', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const refreshQueue = async () => {
    setBusy(true);
    setActionResult('');
    try {
      await apiPut('/settings', settings);
      const data = await fetchQueueSilent();
      if (data.error) {
        show(data.error, 'danger');
        return;
      }
      show(`Queue refreshed: ${data.counts?.total ?? 0} item(s).`, 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Refresh failed', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const toggleId = (syncId: string, setter: Dispatch<SetStateAction<string[]>>) => {
    if (!syncId) return;
    setter((prev) =>
      prev.includes(syncId) ? prev.filter((id) => id !== syncId) : [...prev, syncId]
    );
  };

  const runImport = async (onlySyncIds?: string[]) => {
    if (onlySyncIds && onlySyncIds.length === 0) return;
    setBusy(true);
    setActionResult('');
    try {
      await apiPut('/settings', settings);
      const data = await apiPost<{
        message: string;
        inserted: number;
        updated: number;
        failed: number;
        errors: string[];
      }>('/import', {
        publishStatus: settings.defaultPublishStatus,
        ...(onlySyncIds?.length ? { onlySyncIds } : {}),
      });
      setActionResult(formatImportResult(data));
      show(data.message, data.failed > 0 ? 'danger' : 'success');
      setSelectedQueueIds([]);
      await fetchQueueSilent();
      await loadSyncedEntries();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Import failed', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const askImportAll = () => {
    if (safeQueuePosts.length === 0) return;
    setPendingConfirm({
      title: 'Import all queued posts?',
      description: `Import ${safeQueuePosts.length} post(s) from the Brandstory queue into Strapi.`,
      note: 'Existing entries with the same brandstorySyncId will be overwritten (upsert). New posts will be created.',
      confirmLabel: 'Import all',
      variant: 'default',
      run: () => runImport(),
    });
  };

  const askImportSelected = () => {
    if (selectedQueueIds.length === 0) return;
    setPendingConfirm({
      title: 'Import selected posts?',
      description: `Import ${selectedQueueIds.length} selected post(s) from the queue.`,
      note: 'Matching Strapi entries will be updated in place by brandstorySyncId.',
      confirmLabel: 'Import selected',
      variant: 'default',
      run: () => runImport(selectedQueueIds),
    });
  };

  const doClearImportedIds = async () => {
    const folder = settings.folderPair || 'current folder';
    setBusy(true);
    setActionResult('');
    try {
      await apiPut('/settings', settings);
      const data = await apiPost<{ cleared: number; folderPair: string }>('/clear-imported-ids');
      const msg = `Cleared ${data.cleared} imported id(s) for "${data.folderPair || folder}".`;
      setActionResult(msg);
      show(msg, 'success');
      await fetchQueueSilent();
      await loadSyncedEntries();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Clear imported IDs failed', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const askClearImportedIds = () => {
    const folder = settings.folderPair || 'current folder';
    setPendingConfirm({
      title: 'Clear imported IDs?',
      description: `Reset Brandstory tracking for folder "${folder}" so those posts can appear in the Import queue again.`,
      note: 'This does NOT delete Strapi blog entries. It only clears the plugin imported-ids list for this folder.',
      confirmLabel: 'Clear imported IDs',
      variant: 'secondary',
      run: doClearImportedIds,
    });
  };

  const doDeleteImportedSelected = async () => {
    if (selectedImportedIds.length === 0) return;
    setBusy(true);
    setActionResult('');
    try {
      const data = await apiPost<{
        deleted: number;
        missing: number;
        errors: string[];
      }>('/delete-by-sync-ids', { syncIds: selectedImportedIds });
      const msg = `Deleted ${data.deleted}, missing ${data.missing}.${
        data.errors?.length ? `\nErrors: ${data.errors.join('; ')}` : ''
      }`;
      setActionResult(msg);
      show(
        `Deleted ${data.deleted} entr${data.deleted === 1 ? 'y' : 'ies'}.`,
        data.errors?.length ? 'danger' : 'success'
      );
      setSelectedImportedIds([]);
      await loadSyncedEntries();
      await fetchQueueSilent();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Delete failed', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const askDeleteImportedSelected = () => {
    if (selectedImportedIds.length === 0) return;
    setPendingConfirm({
      title: 'Delete selected Strapi entries?',
      description: `Permanently delete ${selectedImportedIds.length} entr${
        selectedImportedIds.length === 1 ? 'y' : 'ies'
      } matched by brandstorySyncId.`,
      note: 'This cannot be undone from Strapi. Imported-id tracking for those items is also cleared so they can be re-fetched later.',
      confirmLabel: 'Delete selected',
      variant: 'danger',
      run: doDeleteImportedSelected,
    });
  };

  const doResyncImportedSelected = async () => {
    if (selectedImportedIds.length === 0) return;
    setBusy(true);
    setActionResult('');
    try {
      await apiPut('/settings', settings);
      const data = await apiPost<{
        message: string;
        inserted: number;
        updated: number;
        failed: number;
        errors: string[];
        missingSyncIds?: string[];
      }>('/resync-by-sync-ids', {
        syncIds: selectedImportedIds,
        publishStatus: settings.defaultPublishStatus,
      });
      setActionResult(formatImportResult(data));
      const softFail = (data.failed || 0) > 0 || (data.missingSyncIds?.length || 0) > 0;
      show(data.message, softFail ? 'danger' : 'success');
      setSelectedImportedIds([]);
      await loadSyncedEntries();
      await fetchQueueSilent();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Re-sync selected failed', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const askResyncImportedSelected = () => {
    if (selectedImportedIds.length === 0) return;
    setPendingConfirm({
      title: 'Re-sync selected entries?',
      description: `Pull ${selectedImportedIds.length} selected post(s) from Brandstory and upsert into Strapi by brandstorySyncId.`,
      note: 'Body, images, and mapped fields for those entries will be overwritten. Sibling dynamic-zone components are kept.',
      confirmLabel: 'Re-sync selected',
      variant: 'danger',
      run: doResyncImportedSelected,
    });
  };

  const doResyncFolder = async () => {
    setBusy(true);
    setActionResult('');
    try {
      await apiPut('/settings', settings);
      const data = await apiPost<{
        message: string;
        inserted: number;
        updated: number;
        failed: number;
        errors: string[];
      }>('/resync-folder', { publishStatus: settings.defaultPublishStatus });
      setActionResult(formatImportResult(data));
      show(data.message, data.failed > 0 ? 'danger' : 'success');
      setSelectedImportedIds([]);
      await loadSyncedEntries();
      await fetchQueueSilent();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Re-sync folder failed', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const askResyncFolder = () => {
    const folder = settings.folderPair || 'current folder';
    setPendingConfirm({
      title: 'Re-sync entire folder?',
      description: `Clear imported IDs for "${folder}", fetch all posts Brandstory returns for that folder, then upsert every one into Strapi.`,
      note: 'This can overwrite many existing blog bodies/images at once. It does not delete Strapi entries first. Prefer Re-sync selected if you only need a few posts.',
      confirmLabel: 'Re-sync entire folder',
      variant: 'danger',
      run: doResyncFolder,
    });
  };

  const setField = (key: keyof Settings, value: string | number) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const setMap = (key: keyof FieldMap, value: string) => {
    setSettings((s) => ({ ...s, fieldMap: { ...s.fieldMap, [key]: value } }));
  };

  const optionLabel = (a: AttrInfo) => `${a.name} (${a.type}${a.multiple ? ', multi' : ''})`;

  const navBtn = (id: MainTab, label: string) => (
    <Button variant={tab === id ? 'default' : 'tertiary'} onClick={() => setTab(id)}>
      {label}
    </Button>
  );

  return (
    <Page.Main>
      <Layouts.Header
        title="Brandstory AI"
        subtitle="Sync Brandstory AI CONTENT FACTORY blogs into Strapi"
        primaryAction={
          <Flex gap={2} wrap="wrap">
            {navBtn('settings', 'Settings')}
            {navBtn('import-queue', 'Import queue')}
            {navBtn('imported', 'Imported')}
            {navBtn('logs', 'Sync logs')}
          </Flex>
        }
      />
      <Layouts.Content>
        <WarningDialog
          open={Boolean(pendingConfirm)}
          title={pendingConfirm?.title || ''}
          description={pendingConfirm?.description || ''}
          note={pendingConfirm?.note}
          confirmLabel={pendingConfirm?.confirmLabel}
          variant={pendingConfirm?.variant || 'danger'}
          loading={busy}
          onConfirm={async () => {
            if (pendingConfirm) await pendingConfirm.run();
          }}
          onOpenChange={(open) => {
            if (!open && !busy) setPendingConfirm(null);
          }}
        />

        {statusMsg && (
          <Box paddingBottom={4}>
            <Alert
              closeLabel="Close"
              title={statusMsg.variant === 'danger' ? 'Error' : 'Notice'}
              variant={
                statusMsg.variant === 'danger'
                  ? 'danger'
                  : statusMsg.variant === 'success'
                    ? 'success'
                    : 'default'
              }
              onClose={() => setStatusMsg(null)}
            >
              {statusMsg.text}
            </Alert>
          </Box>
        )}

        {tab === 'settings' && (
          <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
            <Typography variant="delta">App connection</Typography>
            <Box paddingTop={2} paddingBottom={4}>
              <Typography variant="pi" textColor="neutral600">
                Resolved insert endpoint:{' '}
                <Typography as="span" fontWeight="bold">
                  {settings.insertApiUrl || '— configure URL + workspace —'}
                </Typography>
              </Typography>
            </Box>

            <Flex direction="column" gap={4} alignItems="stretch">
              <Field.Root name="siteUrl" hint="Brandstory app origin, e.g. https://app.brandstory.ai">
                <Field.Label>App site URL</Field.Label>
                <TextInput
                  value={settings.siteUrl}
                  onChange={(e: any) => setField('siteUrl', e.target.value)}
                  placeholder="https://app.brandstory.ai"
                />
                <Field.Hint />
              </Field.Root>

              <Field.Root name="workspace" hint="Workspace slug from Brandstory (email-derived).">
                <Field.Label>Workspace</Field.Label>
                <TextInput
                  value={settings.workspace}
                  onChange={(e: any) => setField('workspace', e.target.value)}
                />
                <Field.Hint />
              </Field.Root>

              <Field.Root
                name="apiKey"
                hint="Optional. Sent as Bearer + X-API-Key when Brandstory enables API keys."
              >
                <Field.Label>API key (optional)</Field.Label>
                <TextInput
                  type="password"
                  value={settings.apiKey}
                  onChange={(e: any) => setField('apiKey', e.target.value)}
                />
                <Field.Hint />
              </Field.Root>

              <Field.Root
                name="firebaseUid"
                hint="Required for folder-scoped sync. From app Settings → Export & API."
              >
                <Field.Label>Firebase UID</Field.Label>
                <TextInput
                  value={settings.firebaseUid}
                  onChange={(e: any) => setField('firebaseUid', e.target.value)}
                />
                <Field.Hint />
              </Field.Root>

              <Field.Root name="folderPair">
                <Field.Label>Project / folder</Field.Label>
                <SingleSelect
                  value={settings.folderPair || NONE}
                  onChange={(v: string) => setField('folderPair', v === NONE ? '' : v)}
                  placeholder="Entire workspace"
                >
                  <SingleSelectOption value={NONE}>— Entire workspace —</SingleSelectOption>
                  {folders.map((p) => (
                    <SingleSelectOption key={p} value={p}>
                      {p}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Field.Root>

              <Flex gap={2}>
                <Button onClick={loadFolders} loading={busy} variant="secondary">
                  Load project folders
                </Button>
                <Button onClick={testConnection} loading={busy} variant="secondary">
                  Test connection
                </Button>
                <Typography variant="pi">API: {connStatus}</Typography>
              </Flex>

              <Divider />

              <Typography variant="delta">Target article content type</Typography>
              <Typography variant="pi" textColor="neutral600">
                Pick the collection type that should receive Brandstory posts. Field mapping
                dropdowns fill automatically — adjust if needed.
              </Typography>

              <Field.Root name="contentTypeUid">
                <Field.Label>Content type</Field.Label>
                <SingleSelect
                  value={settings.contentTypeUid || NONE}
                  onChange={(v: string) => {
                    if (v === NONE) {
                      setField('contentTypeUid', '');
                      return;
                    }
                    onContentTypeChange(v);
                  }}
                  placeholder="Select a content type"
                >
                  <SingleSelectOption value={NONE}>— select —</SingleSelectOption>
                  {contentTypes.map((ct) => (
                    <SingleSelectOption key={ct.uid} value={ct.uid}>
                      {ct.displayName} ({ct.uid})
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Field.Root>

              <Flex gap={2}>
                <Button
                  variant="tertiary"
                  disabled={!settings.contentTypeUid}
                  onClick={() => {
                    if (!settings.contentTypeUid) return;
                    applyAutoMap(settings.contentTypeUid);
                    show('Field mapping re-suggested from schema.', 'success');
                  }}
                >
                  Auto-map fields again
                </Button>
              </Flex>

              <Field.Root name="defaultPublishStatus">
                <Field.Label>Default publish status</Field.Label>
                <SingleSelect
                  value={settings.defaultPublishStatus}
                  onChange={(v: string) => setField('defaultPublishStatus', v)}
                >
                  <SingleSelectOption value="published">Published</SingleSelectOption>
                  <SingleSelectOption value="draft">Draft</SingleSelectOption>
                </SingleSelect>
              </Field.Root>

              <Divider />

              <Typography variant="delta">Article body destination</Typography>
              <Field.Root
                name="contentMode"
                hint="Use Dynamic zone when your article content lives in a DZ (common on marketing sites)."
              >
                <Field.Label>Write HTML into</Field.Label>
                <SingleSelect
                  value={settings.contentMode}
                  onChange={(v: string) =>
                    setField('contentMode', v === 'dynamiczone' ? 'dynamiczone' : 'field')
                  }
                >
                  <SingleSelectOption value="field">Single field (richtext / text)</SingleSelectOption>
                  <SingleSelectOption value="dynamiczone" disabled={dzFields.length === 0}>
                    Dynamic zone{dzFields.length === 0 ? ' (none on this type)' : ''}
                  </SingleSelectOption>
                </SingleSelect>
                <Field.Hint />
              </Field.Root>

              {settings.contentMode === 'dynamiczone' ? (
                <Flex direction="column" gap={4} alignItems="stretch">
                  <FieldSelect
                    label="Dynamic zone field"
                    hint="Attribute of type dynamiczone on the content type."
                    value={settings.dynamicZone.field}
                    options={dzFields.map((a) => ({
                      value: a.name,
                      label: optionLabel(a),
                    }))}
                    onChange={(v) => {
                      setSettings((s) => ({
                        ...s,
                        dynamicZone: { field: v, component: '', htmlField: '' },
                      }));
                    }}
                  />
                  <FieldSelect
                    label="Component inside zone"
                    hint="Which __component entry receives the article HTML."
                    value={settings.dynamicZone.component}
                    options={dzComponents.map((c) => ({
                      value: c.uid,
                      label: `${c.displayName} (${c.uid})`,
                    }))}
                    onChange={(v) => {
                      const comp = components.find((c) => c.uid === v);
                      const html =
                        comp?.attributes.find((a) =>
                          ['body', 'content', 'html', 'text', 'richtext'].includes(
                            a.name.toLowerCase()
                          )
                        ) ||
                        comp?.attributes.find((a) =>
                          ['richtext', 'text', 'string', 'blocks'].includes(a.type)
                        );
                      setSettings((s) => ({
                        ...s,
                        dynamicZone: {
                          ...s.dynamicZone,
                          component: v,
                          htmlField: html?.name || '',
                        },
                      }));
                    }}
                  />
                  <FieldSelect
                    label="HTML field on component"
                    hint="Component attribute for body (richtext/text/blocks)."
                    value={settings.dynamicZone.htmlField}
                    options={htmlFieldsOnComponent.map((a) => ({
                      value: a.name,
                      label: optionLabel(a),
                    }))}
                    onChange={(v) => {
                      setSettings((s) => ({
                        ...s,
                        dynamicZone: { ...s.dynamicZone, htmlField: v },
                      }));
                    }}
                  />
                </Flex>
              ) : (
                <FieldSelect
                  label="Content (HTML / rich text field)"
                  hint="Direct richtext/text/blocks field on the content type."
                  value={settings.fieldMap.content}
                  options={attrsForSlot(selectedCt?.attributes || [], 'content').map((a) => ({
                    value: a.name,
                    label: optionLabel(a),
                  }))}
                  onChange={(v) => setMap('content', v)}
                />
              )}

              <Divider />
              <Typography variant="delta">Field mapping</Typography>
              <Typography variant="pi" textColor="neutral600">
                Each Brandstory value maps to one attribute on the selected content type.
              </Typography>

              <Box padding={3} background="neutral100" hasRadius>
                <Typography>
                  Sync ID (fixed):{' '}
                  <Typography as="span" fontWeight="bold">
                    {SYNC_ID_FIELD}
                  </Typography>
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  Always written from Brandstory sync_id. Add this unique string field on the
                  content type — it is not configurable.
                </Typography>
              </Box>

              {FIELD_MAP_LABELS.filter(([key]) => key !== 'content').map(([key, label]) => (
                <FieldSelect
                  key={key}
                  label={label}
                  value={settings.fieldMap[key]}
                  options={attrsForSlot(selectedCt?.attributes || [], key).map((a) => ({
                    value: a.name,
                    label: optionLabel(a),
                  }))}
                  onChange={(v) => setMap(key, v)}
                />
              ))}

              {settings.contentTypeUid &&
                !selectedCt?.attributes?.some((a) => a.name === SYNC_ID_FIELD) && (
                  <Box padding={3} background="danger100" hasRadius>
                    <Typography textColor="danger700">
                      Missing required field{' '}
                      <Typography as="span" fontWeight="bold">
                        {SYNC_ID_FIELD}
                      </Typography>{' '}
                      on this content type (unique string). Create it in Content-Type Builder, then
                      reload settings.
                    </Typography>
                  </Box>
                )}

              {settings.contentMode === 'dynamiczone' &&
                settings.dynamicZone.field &&
                settings.dynamicZone.component && (
                  <Box padding={3} background="secondary100" hasRadius>
                    <Typography textColor="neutral700">
                      HTML writes to{' '}
                      <Typography as="span" fontWeight="bold">
                        {settings.dynamicZone.field} → {settings.dynamicZone.component}.
                        {settings.dynamicZone.htmlField}
                      </Typography>
                      . Sibling zone components (e.g. blogImage) are kept on update.
                    </Typography>
                  </Box>
                )}

              <Box>
                <Button onClick={saveSettings} loading={busy}>
                  Save connection
                </Button>
              </Box>
            </Flex>
          </Box>
        )}

        {tab === 'import-queue' && (
          <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
            <Typography variant="delta">Import queue</Typography>
            <Box paddingTop={2} paddingBottom={3}>
              <Typography variant="pi" textColor="neutral600">
                Fetch posts from Brandstory for the configured folder, then import into Strapi.
                Existing entries with the same {SYNC_ID_FIELD} are updated (upsert).
              </Typography>
            </Box>
            <Box paddingBottom={4}>
              <Typography variant="pi" textColor="neutral600">
                {queueCounts
                  ? `Queue: ${queueCounts.total} · new ${queueCounts.new} · already in Strapi ${queueCounts.update}`
                  : 'Click Refresh queue to load posts from Brandstory.'}
                {trackedImportedIds > 0
                  ? ` · Tracking ${trackedImportedIds} imported id(s) for this folder.`
                  : ''}
              </Typography>
            </Box>

            <Flex gap={2} paddingBottom={3} wrap="wrap">
              <Button onClick={refreshQueue} loading={busy} variant="secondary">
                Refresh queue
              </Button>
              <Button
                onClick={askImportAll}
                loading={busy}
                disabled={safeQueuePosts.length === 0}
              >
                Import all in queue
              </Button>
              <Button
                onClick={askImportSelected}
                loading={busy}
                disabled={selectedQueueIds.length === 0}
              >
                Import selected ({selectedQueueIds.length})
              </Button>
              <Button onClick={askClearImportedIds} loading={busy} variant="tertiary">
                Clear imported IDs
              </Button>
            </Flex>

            <Box paddingBottom={4}>
              <Typography variant="pi" textColor="neutral600">
                Queue empty after a prior import? Use Clear imported IDs, then Refresh queue.
                That only resets tracking — it does not delete Strapi content.
              </Typography>
            </Box>

            {actionResult && (
              <Box paddingBottom={4}>
                <Textarea value={actionResult} readOnly style={{ minHeight: 72 }} />
              </Box>
            )}

            <Table colCount={5} rowCount={Math.max(safeQueuePosts.length, 1)}>
              <Thead>
                <Tr>
                  <Th>
                    <input
                      type="checkbox"
                      checked={allQueueSelected}
                      disabled={queueSyncIds.length === 0}
                      onChange={() =>
                        setSelectedQueueIds(allQueueSelected ? [] : queueSyncIds)
                      }
                      aria-label="Select all queue posts"
                    />
                  </Th>
                  <Th>
                    <Typography variant="sigma">Title</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">In Strapi</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Sync ID</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">API ID</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {safeQueuePosts.map((p) => (
                  <Tr key={p.sync_id || p.id}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selectedQueueIds.includes(p.sync_id)}
                        onChange={() => toggleId(p.sync_id, setSelectedQueueIds)}
                        aria-label={`Select ${p.title}`}
                      />
                    </Td>
                    <Td>
                      <Typography>{p.title}</Typography>
                      {!p.has_content && (
                        <Typography variant="pi" textColor="warning600">
                          No content payload
                        </Typography>
                      )}
                    </Td>
                    <Td>
                      <Typography textColor={p.existsInStrapi ? 'success600' : 'neutral600'}>
                        {p.existsInStrapi ? 'Yes (will update)' : 'No (will insert)'}
                      </Typography>
                    </Td>
                    <Td>
                      <Typography textColor="neutral600" variant="pi">
                        {p.sync_id}
                      </Typography>
                    </Td>
                    <Td>
                      <Typography textColor="neutral600" variant="pi">
                        {p.id}
                      </Typography>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {safeQueuePosts.length === 0 && (
              <Box paddingTop={4}>
                <Typography textColor="neutral600">
                  No items in queue. Refresh queue, or Clear imported IDs if posts were already
                  tracked.
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {tab === 'imported' && (
          <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
            <Typography variant="delta">Imported in Strapi</Typography>
            <Box paddingTop={2} paddingBottom={3}>
              <Typography variant="pi" textColor="neutral600">
                Manage entries that already have {SYNC_ID_FIELD}. Select rows to delete or re-sync
                (upsert from Brandstory without deleting first).
              </Typography>
            </Box>
            <Box paddingBottom={4}>
              <Typography variant="pi" textColor="neutral600">
                {safeSyncedEntries.length} synced entr
                {safeSyncedEntries.length === 1 ? 'y' : 'ies'}
                {settings.folderPair ? ` · folder tracking: ${trackedImportedIds} id(s)` : ''}
              </Typography>
            </Box>

            <Flex gap={2} paddingBottom={3} wrap="wrap">
              <Button onClick={loadSyncedEntries} loading={busy} variant="secondary">
                Refresh list
              </Button>
              <Button
                onClick={askResyncImportedSelected}
                loading={busy}
                disabled={selectedImportedIds.length === 0}
              >
                Re-sync selected ({selectedImportedIds.length})
              </Button>
              <Button
                onClick={askDeleteImportedSelected}
                loading={busy}
                variant="danger"
                disabled={selectedImportedIds.length === 0}
              >
                Delete selected ({selectedImportedIds.length})
              </Button>
              <Button onClick={askResyncFolder} loading={busy} variant="danger-light">
                Re-sync entire folder
              </Button>
            </Flex>

            <Box paddingBottom={4}>
              <Typography variant="pi" textColor="neutral600">
                Re-sync selected updates body/images in place. Delete selected removes Strapi
                entries only for chosen sync ids. Re-sync entire folder affects the whole
                configured folder queue.
              </Typography>
            </Box>

            {actionResult && (
              <Box paddingBottom={4}>
                <Textarea value={actionResult} readOnly style={{ minHeight: 72 }} />
              </Box>
            )}

            <Table colCount={5} rowCount={Math.max(safeSyncedEntries.length, 1)}>
              <Thead>
                <Tr>
                  <Th>
                    <input
                      type="checkbox"
                      checked={allImportedSelected}
                      disabled={importedSyncIds.length === 0}
                      onChange={() =>
                        setSelectedImportedIds(allImportedSelected ? [] : importedSyncIds)
                      }
                      aria-label="Select all imported entries"
                    />
                  </Th>
                  <Th>
                    <Typography variant="sigma">Title</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Status</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Sync ID</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Document</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {safeSyncedEntries.map((e) => (
                  <Tr key={e.documentId || e.syncId}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selectedImportedIds.includes(e.syncId)}
                        onChange={() => toggleId(e.syncId, setSelectedImportedIds)}
                        aria-label={`Select ${e.title}`}
                      />
                    </Td>
                    <Td>
                      <Typography>{e.title}</Typography>
                    </Td>
                    <Td>
                      <Typography textColor="neutral600">{e.status || '—'}</Typography>
                    </Td>
                    <Td>
                      <Typography textColor="neutral600" variant="pi">
                        {e.syncId}
                      </Typography>
                    </Td>
                    <Td>
                      {e.documentId && settings.contentTypeUid ? (
                        <Typography>
                          <a
                            href={`/admin/content-manager/collection-types/${settings.contentTypeUid}/${e.documentId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        </Typography>
                      ) : (
                        <Typography textColor="neutral600">—</Typography>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {safeSyncedEntries.length === 0 && (
              <Box paddingTop={4}>
                <Typography textColor="neutral600">
                  No synced Strapi entries found for this content type. Import from Import queue
                  first.
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {tab === 'logs' && (
          <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
            <Flex justifyContent="space-between" paddingBottom={4}>
              <Typography variant="delta">Sync logs</Typography>
              <Button variant="tertiary" onClick={loadLogs} loading={busy}>
                Refresh
              </Button>
            </Flex>
            <Table colCount={6} rowCount={Math.max(logs.length, 1)}>
              <Thead>
                <Tr>
                  <Th>
                    <Typography variant="sigma">When</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Source</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Status</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Message</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">I / U / F</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">ms</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((l) => (
                  <Tr key={l.documentId}>
                    <Td>
                      <Typography variant="pi">
                        {l.createdAt ? new Date(l.createdAt).toLocaleString() : '—'}
                      </Typography>
                    </Td>
                    <Td>
                      <Typography>{l.source}</Typography>
                    </Td>
                    <Td>
                      <Typography>{l.status}</Typography>
                    </Td>
                    <Td>
                      <Typography>{l.message}</Typography>
                    </Td>
                    <Td>
                      <Typography>
                        {l.inserted}/{l.updated}/{l.failed}
                      </Typography>
                    </Td>
                    <Td>
                      <Typography>{l.durationMs ?? '—'}</Typography>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {logs.length === 0 && (
              <Box paddingTop={4}>
                <Typography textColor="neutral600">No sync logs yet.</Typography>
              </Box>
            )}
          </Box>
        )}
      </Layouts.Content>
    </Page.Main>
  );
};

export default HomePage;
