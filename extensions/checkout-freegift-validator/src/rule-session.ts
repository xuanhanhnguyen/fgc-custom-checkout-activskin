import type {FreeGiftRule} from "./logic";

const STORAGE_VERSION = 1;
const STORAGE_KEY_PREFIX = "free-gift-prismic-session";
const PENDING_CHECKOUT_KEY = "pending-checkout";

type RuleStorage = {
  read<T = unknown>(key: string): Promise<T | null>;
  write(key: string, data: unknown): Promise<void>;
};

type RuleFetcher = (
  ruleIds: string[],
  accessToken: string,
) => Promise<Map<string, FreeGiftRule>>;

type SessionStatus = "idle" | "initial-failed" | "final-failed" | "success";

type RuntimeSession = {
  status: SessionStatus;
  rulesById?: Map<string, FreeGiftRule>;
  request?: Promise<RuleLoadResult>;
  restored: boolean;
  restoreRequest?: Promise<void>;
};

type StoredSession = {
  version: number;
  status: Exclude<SessionStatus, "idle">;
  rules?: FreeGiftRule[];
};

type ValidationProgress = {
  validatedSignature?: string;
  acknowledgementSignature?: string;
};

export type RuleLoadResult =
  | {status: "success"; rulesById: Map<string, FreeGiftRule>}
  | {status: "unavailable"; error?: unknown};

const sessions = new Map<string, RuntimeSession>();
const validationProgress = new Map<string, ValidationProgress>();

export function isCheckoutAlreadyValidated(
  checkoutToken: string | undefined,
  signature: string,
) {
  return getValidationProgress(checkoutToken).validatedSignature === signature;
}

export function recordValidatedCheckout(
  checkoutToken: string | undefined,
  signature: string,
  removedCount: number,
) {
  const progress = getValidationProgress(checkoutToken);
  progress.validatedSignature = signature;
  if (removedCount > 0) {
    progress.acknowledgementSignature = signature;
  }
}

export function needsRemovalAcknowledgement(
  checkoutToken: string | undefined,
  signature: string,
) {
  return (
    getValidationProgress(checkoutToken).acknowledgementSignature === signature
  );
}

export function acknowledgeRemovedGifts(checkoutToken: string | undefined) {
  getValidationProgress(checkoutToken).acknowledgementSignature = undefined;
}

export async function loadPrismicRulesForCheckout({
  ruleIds,
  accessToken,
  checkoutToken,
  storage,
  finalAttempt,
  fetchRules,
}: {
  ruleIds: string[];
  accessToken: string;
  checkoutToken?: string;
  storage: RuleStorage;
  finalAttempt: boolean;
  fetchRules: RuleFetcher;
}): Promise<RuleLoadResult> {
  const sessionKey = getSessionKey(checkoutToken);
  const session = getRuntimeSession(sessionKey, checkoutToken);
  await restoreSession(sessionKey, checkoutToken, session, storage);

  if (session.status === "success" && session.rulesById) {
    return {status: "success", rulesById: session.rulesById};
  }

  if (session.status === "final-failed") {
    return {status: "unavailable"};
  }

  if (session.status === "initial-failed" && !finalAttempt) {
    return {status: "unavailable"};
  }

  if (session.request) {
    const result = await session.request;
    if (
      finalAttempt &&
      result.status === "unavailable" &&
      session.status === "initial-failed"
    ) {
      return loadPrismicRulesForCheckout({
        ruleIds,
        accessToken,
        checkoutToken,
        storage,
        finalAttempt,
        fetchRules,
      });
    }
    return result;
  }

  const attemptStatus = finalAttempt ? "final-failed" : "initial-failed";
  const request = fetchRules(ruleIds, accessToken)
    .then(async (rulesById): Promise<RuleLoadResult> => {
      session.status = "success";
      session.rulesById = rulesById;
      await persistSession(sessionKey, checkoutToken, session, storage);
      return {status: "success", rulesById};
    })
    .catch(async (error): Promise<RuleLoadResult> => {
      session.status = attemptStatus;
      session.rulesById = undefined;
      await persistSession(sessionKey, checkoutToken, session, storage);
      return {status: "unavailable", error};
    })
    .finally(() => {
      session.request = undefined;
    });

  session.request = request;
  return request;
}

function getSessionKey(checkoutToken?: string) {
  return checkoutToken || PENDING_CHECKOUT_KEY;
}

function getValidationProgress(checkoutToken?: string) {
  const sessionKey = getSessionKey(checkoutToken);
  let progress = validationProgress.get(sessionKey);
  if (!progress && checkoutToken) {
    progress = validationProgress.get(PENDING_CHECKOUT_KEY);
    if (progress) {
      validationProgress.delete(PENDING_CHECKOUT_KEY);
      validationProgress.set(sessionKey, progress);
    }
  }
  if (!progress) {
    progress = {};
    validationProgress.set(sessionKey, progress);
  }
  return progress;
}

function getRuntimeSession(sessionKey: string, checkoutToken?: string) {
  let session = sessions.get(sessionKey);
  if (!session && checkoutToken) {
    session = sessions.get(PENDING_CHECKOUT_KEY);
    if (session) {
      sessions.delete(PENDING_CHECKOUT_KEY);
      sessions.set(sessionKey, session);
    }
  }
  if (!session) {
    session = {status: "idle", restored: false};
    sessions.set(sessionKey, session);
  }
  return session;
}

async function restoreSession(
  sessionKey: string,
  checkoutToken: string | undefined,
  session: RuntimeSession,
  storage: RuleStorage,
) {
  if (session.restored || !checkoutToken) return;
  if (session.restoreRequest) return session.restoreRequest;

  session.restoreRequest = storage
    .read<StoredSession>(storageKey(sessionKey))
    .then((stored) => {
      if (!isStoredSession(stored) || session.status !== "idle") return;
      session.status = stored.status;
      if (stored.status === "success") {
        session.rulesById = new Map(
          (stored.rules ?? []).map((rule) => [rule.id, rule]),
        );
      }
    })
    .catch((error) => {
      console.error("Unable to restore the Prismic rule session", error);
    })
    .finally(() => {
      session.restored = true;
      session.restoreRequest = undefined;
    });

  return session.restoreRequest;
}

async function persistSession(
  sessionKey: string,
  checkoutToken: string | undefined,
  session: RuntimeSession,
  storage: RuleStorage,
) {
  if (!checkoutToken || session.status === "idle") return;

  const stored: StoredSession = {
    version: STORAGE_VERSION,
    status: session.status,
    rules:
      session.status === "success" && session.rulesById
        ? [...session.rulesById.values()]
        : undefined,
  };

  try {
    await storage.write(storageKey(sessionKey), stored);
  } catch (error) {
    console.error("Unable to persist the Prismic rule session", error);
  }
}

function storageKey(sessionKey: string) {
  return `${STORAGE_KEY_PREFIX}:${sessionKey}`;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<StoredSession>;
  if (stored.version !== STORAGE_VERSION) return false;
  if (stored.status === "success") return Array.isArray(stored.rules);
  return stored.status === "initial-failed" || stored.status === "final-failed";
}

export function resetRuleSessionsForTests() {
  sessions.clear();
  validationProgress.clear();
}
