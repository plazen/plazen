type Release = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  [key: string]: unknown;
};

const GITHUB_TOKEN = process.env.GITHUB_BOT_TOKEN;
const OWNER = process.env.GITHUB_OWNER || "plazen";
const REPO = process.env.GITHUB_REPO || "plazen";

const REACTIONS = [
  "+1",
  "-1",
  "laugh",
  "confused",
  "heart",
  "hooray",
  "rocket",
  "eyes",
] as const;

function getAuthHeaders(additional: Record<string, string> = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_BOT_TOKEN is not set. Cannot perform GitHub bot operations.",
    );
  }

  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    ...additional,
  };
}

async function fetchJson<T = unknown>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = `GitHub API error ${res.status} ${res.statusText}: ${text}`;
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

async function getReleaseByTag(tag: string): Promise<Release> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(
    tag,
  )}`;

  return await fetchJson<Release>(url, {
    headers: getAuthHeaders(),
  });
}

async function appendNotesUrlToReleaseBody(
  releaseId: number,
  notesUrl: string,
): Promise<Release> {
  const getUrl = `https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}`;
  const existing = await fetchJson<Release>(getUrl, {
    headers: getAuthHeaders(),
  });

  const currentBody = existing.body || "";
  if (currentBody.includes(notesUrl)) {
    return existing;
  }

  const notesMd = `# See full release notes: ${notesUrl}\n`;
  const newBody = notesMd + currentBody;

  const patchUrl = `https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}`;
  const updated = await fetchJson<Release>(patchUrl, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ body: newBody }),
  });

  return updated;
}

async function addReactionToRelease(
  releaseId: number,
  content: (typeof REACTIONS)[number],
): Promise<unknown> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/reactions`;

  // The Reactions API requires the special Accept header
  const headers = getAuthHeaders({
    Accept: "application/vnd.github.squirrel-girl-preview+json",
  });

  return await fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ content }),
  });
}

export async function addAllReactionsToRelease(releaseId: number) {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_BOT_TOKEN is not configured.");
  }

  const promises = REACTIONS.map((r) =>
    addReactionToRelease(releaseId, r).then(
      (res) => ({ reaction: r, status: "fulfilled", result: res }),
      (err) => ({
        reaction: r,
        status: "rejected",
        reason: (err as Error).message || err,
      }),
    ),
  );

  const results = await Promise.all(promises);
  const summary = {
    success: results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as any).reaction),
    failed: results
      .filter((r) => r.status === "rejected")
      .map((r) => ({
        reaction: (r as any).reaction,
        reason: (r as any).reason,
      })),
    raw: results,
  };

  return summary;
}

export async function syncReleaseWithNotes(
  releaseTag: string,
  notesUrl: string,
) {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_BOT_TOKEN must be set to sync release with notes.");
  }

  const release = await getReleaseByTag(releaseTag);

  const updatedRelease = await appendNotesUrlToReleaseBody(
    release.id,
    notesUrl,
  );

  let reactionsSummary: unknown;
  try {
    reactionsSummary = await addAllReactionsToRelease(release.id);
  } catch (err) {
    reactionsSummary = { error: (err as Error).message || err };
  }

  return {
    release: updatedRelease,
    reactions: reactionsSummary,
  };
}

export async function trySyncReleaseWithNotes(
  releaseTag: string,
  notesUrl: string,
) {
  try {
    return await syncReleaseWithNotes(releaseTag, notesUrl);
  } catch (error) {
    console.error("GitHub bot sync failed:", error);
    return { error: (error as Error).message || error };
  }
}
