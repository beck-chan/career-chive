"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createDay as createDayAction,
  clearDaysInRange as clearDaysAction,
  deleteDaysInRange as deleteDaysAction,
  deleteOrganization as deleteOrganizationAction,
  factoryReset as factoryResetAction,
  loadArchive,
  removeDay as removeDayAction,
  saveDay as saveDayAction,
  saveOrganization as saveOrganizationAction,
  updateArchiveStart as updateArchiveStartAction,
  updateAutogenerateStart as updateAutogenerateStartAction,
  updateLogin as updateLoginAction,
  updateTimezone as updateTimezoneAction,
  type ArchiveSnapshot,
} from "../app/actions/archive";
import {
  createAttachmentUpload,
  uploadAttachmentBytes,
} from "../app/actions/attachments";
import {
  DEFAULT_SETTINGS,
  emptyDay,
  isCreatableDay,
  normalizeTimeZone,
  todayIso,
  type DayEntry,
  type Org,
  type Settings,
} from "./data";
import { careerchiveHref } from "./paths";

type StoreStatus = "loading" | "ready" | "error" | "signedOut";

type DemoContextValue = {
  status: StoreStatus;
  settings: Settings;
  days: Record<string, Record<string, DayEntry>>;
  getDay: (orgId: string, iso: string) => DayEntry;
  setDay: (orgId: string, iso: string, next: DayEntry) => void;
  createDay: (orgId: string, iso: string) => void;
  removeDay: (orgId: string, iso: string) => void;
  clearDaysInRange: (
    orgId: string,
    from: string,
    to: string,
    password: string,
  ) => Promise<boolean>;
  deleteDaysInRange: (
    orgId: string,
    from: string,
    to: string,
    password: string,
  ) => Promise<boolean>;
  saveOrganization: (org: Org) => Promise<boolean>;
  deleteOrganization: (orgId: string, password: string) => Promise<boolean>;
  updateArchiveStart: (date: string) => Promise<boolean>;
  updateAutogenerateStart: (date: string) => Promise<boolean>;
  updateTimezone: (timezone: string) => Promise<boolean>;
  updateLogin: (username: string, password: string) => Promise<boolean>;
  factoryReset: (password: string) => Promise<boolean>;
  uploadAttachment: (input: {
    orgId: string;
    iso: string;
    rowId: string;
    file: File;
  }) => Promise<{ key: string; name: string } | null>;
  attachmentHref: (key: string, name: string) => string;
};

const DemoContext = createContext<DemoContextValue | null>(null);

const EMPTY: ArchiveSnapshot = {
  settings: { ...DEFAULT_SETTINGS, orgs: [] },
  days: {},
};

export function DemoProvider({
  children,
  initialData = EMPTY,
  initialStatus = "ready",
}: {
  children: ReactNode;
  initialData?: ArchiveSnapshot;
  initialStatus?: StoreStatus;
}) {
  const [status, setStatus] = useState<StoreStatus>(initialStatus);
  const [settings, setSettingsState] = useState<Settings>(initialData.settings);
  const [days, setDays] = useState<Record<string, Record<string, DayEntry>>>(
    initialData.days,
  );
  const serverStamp = `${initialStatus}:${initialData.settings.username}:${initialData.settings.archiveStartDate}:${initialData.settings.autogenerateStartDate}:${initialData.settings.timezone}:${initialData.settings.orgs.length}:${Object.values(initialData.days).reduce((count, map) => count + Object.keys(map).length, 0)}`;
  const [appliedStamp, setAppliedStamp] = useState(serverStamp);
  if (appliedStamp !== serverStamp) {
    setAppliedStamp(serverStamp);
    setStatus(initialStatus);
    setSettingsState(initialData.settings);
    setDays(initialData.days);
  }

  const applySnapshot = useCallback((snapshot: ArchiveSnapshot) => {
    setSettingsState(snapshot.settings);
    setDays(snapshot.days);
  }, []);

  const reload = useCallback(async (ensure = true) => {
    const result = await loadArchive({ ensure });
    applySnapshot(result.data);
    if (!result.ok && result.connection) {
      setStatus("error");
      return false;
    }
    if (!result.ok && result.signedOut) {
      setStatus("signedOut");
      return false;
    }
    setStatus("ready");
    return result.ok;
  }, [applySnapshot]);

  const getDay = useCallback(
    (orgId: string, iso: string) => {
      return {
        ...emptyDay(),
        ...(days[orgId]?.[iso] ?? {}),
      };
    },
    [days],
  );

  const setDay = useCallback((orgId: string, iso: string, next: DayEntry) => {
    const org = settings.orgs.find((item) => item.id === orgId);
    const exists = Boolean(days[orgId]?.[iso]);
    if (
      !exists &&
      !isCreatableDay(
        iso,
        settings.archiveStartDate,
        org?.dateActive,
        org?.dateInactive,
        todayIso(undefined, settings.timezone),
      )
    ) {
      return;
    }
    setDays((current) => ({
      ...current,
      [orgId]: {
        ...(current[orgId] ?? {}),
        [iso]: next,
      },
    }));
    void saveDayAction(orgId, iso, next).then((result) => {
      if (!result.ok) void reload(false);
    });
  }, [days, reload, settings.archiveStartDate, settings.orgs, settings.timezone]);

  const createDay = useCallback((orgId: string, iso: string) => {
    const org = settings.orgs.find((item) => item.id === orgId);
    if (
      !isCreatableDay(
        iso,
        settings.archiveStartDate,
        org?.dateActive,
        org?.dateInactive,
        todayIso(undefined, settings.timezone),
      )
    ) {
      return;
    }
    const next = emptyDay();
    setDays((current) => ({
      ...current,
      [orgId]: {
        ...(current[orgId] ?? {}),
        [iso]: next,
      },
    }));
    void createDayAction(orgId, iso).then((result) => {
      if (!result.ok) void reload(false);
    });
  }, [reload, settings.archiveStartDate, settings.orgs, settings.timezone]);

  const removeDay = useCallback((orgId: string, iso: string) => {
    setDays((current) => {
      const orgDays = { ...(current[orgId] ?? {}) };
      delete orgDays[iso];
      return { ...current, [orgId]: orgDays };
    });
    void removeDayAction(orgId, iso).then((result) => {
      if (!result.ok) void reload(false);
    });
  }, [reload]);

  const clearDaysInRange = useCallback(
    async (orgId: string, from: string, to: string, password: string) => {
      const result = await clearDaysAction(orgId, from, to, password);
      if (result.ok) await reload(false);
      return result.ok;
    },
    [reload],
  );

  const deleteDaysInRange = useCallback(
    async (orgId: string, from: string, to: string, password: string) => {
      const result = await deleteDaysAction(orgId, from, to, password);
      if (result.ok) await reload(false);
      return result.ok;
    },
    [reload],
  );

  const saveOrganization = useCallback(
    async (org: Org) => {
      const exists = settings.orgs.some((item) => item.id === org.id);
      setSettingsState((current) => ({
        ...current,
        orgs: exists
          ? current.orgs.map((item) => (item.id === org.id ? org : item))
          : [...current.orgs, org],
      }));
      const result = await saveOrganizationAction(org);
      await reload(true);
      return result.ok;
    },
    [reload, settings.orgs],
  );

  const deleteOrganization = useCallback(
    async (orgId: string, password: string) => {
      const result = await deleteOrganizationAction(orgId, password);
      if (result.ok) await reload(false);
      return result.ok;
    },
    [reload],
  );

  const updateArchiveStart = useCallback(
    async (date: string) => {
      setSettingsState((current) => ({ ...current, archiveStartDate: date }));
      const result = await updateArchiveStartAction(date);
      await reload(false);
      return result.ok;
    },
    [reload],
  );

  const updateAutogenerateStart = useCallback(
    async (date: string) => {
      const floor = settings.archiveStartDate;
      const next = date && floor && date < floor ? floor : date;
      setSettingsState((current) => ({
        ...current,
        autogenerateStartDate: next,
      }));
      const result = await updateAutogenerateStartAction(next);
      await reload(true);
      return result.ok;
    },
    [reload, settings.archiveStartDate],
  );

  const updateTimezone = useCallback(
    async (timezone: string) => {
      const next = normalizeTimeZone(timezone);
      setSettingsState((current) => ({ ...current, timezone: next }));
      const result = await updateTimezoneAction(next);
      await reload(true);
      return result.ok;
    },
    [reload],
  );

  const updateLogin = useCallback(
    async (username: string, password: string) => {
      const result = await updateLoginAction(username, password);
      if (result.ok) {
        setSettingsState((current) => ({
          ...current,
          username,
          password: password || current.password,
          hasPassword: current.hasPassword || Boolean(password),
        }));
        await reload(false);
      }
      return result.ok;
    },
    [reload],
  );

  const factoryReset = useCallback(
    async (password: string) => {
      const result = await factoryResetAction(password);
      if (result.ok) await reload(false);
      return result.ok;
    },
    [reload],
  );

  const uploadAttachment = useCallback(
    async (input: {
      orgId: string;
      iso: string;
      rowId: string;
      file: File;
    }) => {
      const signed = await createAttachmentUpload({
        orgId: input.orgId,
        iso: input.iso,
        rowId: input.rowId,
        filename: input.file.name,
        contentType: input.file.type,
      });
      if (signed.ok) {
        try {
          const put = await fetch(signed.url, {
            method: "PUT",
            body: input.file,
            headers: {
              "Content-Type": input.file.type || "application/octet-stream",
            },
          });
          if (put.ok) return { key: signed.key, name: input.file.name };
        } catch {
          /* fall through to server upload */
        }
        const form = new FormData();
        form.set("file", input.file);
        form.set("key", signed.key);
        const fallback = await uploadAttachmentBytes(form);
        if (fallback.ok) return { key: fallback.key, name: fallback.name };
      }
      if ("unconfigured" in signed && signed.unconfigured) {
        return { key: "", name: input.file.name };
      }
      const form = new FormData();
      form.set("file", input.file);
      form.set("orgId", input.orgId);
      form.set("iso", input.iso);
      form.set("rowId", input.rowId);
      const posted = await fetch(careerchiveHref("/api/attachments"), {
        method: "POST",
        body: form,
      });
      if (!posted.ok) return { key: "", name: input.file.name };
      const body = (await posted.json()) as { key?: string; name?: string };
      return { key: body.key ?? "", name: body.name ?? input.file.name };
    },
    [],
  );

  const attachmentHref = useCallback((key: string, name: string) => {
    if (!key) return "";
    const base = careerchiveHref("/api/attachments");
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}key=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}`;
  }, []);

  const value = useMemo(
    () => ({
      status,
      settings,
      days,
      getDay,
      setDay,
      createDay,
      removeDay,
      clearDaysInRange,
      deleteDaysInRange,
      saveOrganization,
      deleteOrganization,
      updateArchiveStart,
      updateAutogenerateStart,
      updateTimezone,
      updateLogin,
      factoryReset,
      uploadAttachment,
      attachmentHref,
    }),
    [
      status,
      settings,
      days,
      getDay,
      setDay,
      createDay,
      removeDay,
      clearDaysInRange,
      deleteDaysInRange,
      saveOrganization,
      deleteOrganization,
      updateArchiveStart,
      updateAutogenerateStart,
      updateTimezone,
      updateLogin,
      factoryReset,
      uploadAttachment,
      attachmentHref,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) {
    throw new Error("useDemo must be used inside DemoProvider");
  }
  return value;
}
