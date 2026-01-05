/**
 * githubBot.ts
 *
 * Utilities for lightweight GitHub Releases automation used by Plazen. This
 * module encapsulates a few focused operations against the GitHub REST API:
 *
 * - lookup releases by tag
 * - append a release notes URL into a release body if missing
 * - add a set of reactions to a release to increase discoverability/visibility
 *
 * Important:
 * - Requires `GITHUB_BOT_TOKEN` environment variable for authentication.
 * - `GITHUB_OWNER` and `GITHUB_REPO` may be overridden via environment values,
 *   otherwise they default to `plazen`.
 *
 * The functions are intentionally simple wrappers around fetch-based calls and
 * return structured results or throw informative errors when operations fail.
 */
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

async function graphql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = `GitHub GraphQL API error ${res.status} ${res.statusText}: ${text}`;
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    const message = `GitHub GraphQL error: ${json.errors.map((e: any) => e.message).join(", ")}`;
    throw new Error(message);
  }

  return json.data as T;
}

type DiscussionCategory = {
  id: string;
  name: string;
  slug: string;
};

type RepositoryInfo = {
  repository: {
    id: string;
    discussionCategories: {
      nodes: DiscussionCategory[];
    };
  };
};

type CreatedDiscussion = {
  createDiscussion: {
    discussion: {
      id: string;
      url: string;
      title: string;
    };
  };
};

async function getRepositoryAndCategoryId(
  categoryName: string = "Announcements",
): Promise<{ repositoryId: string; categoryId: string }> {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
        discussionCategories(first: 25) {
          nodes {
            id
            name
            slug
          }
        }
      }
    }
  `;

  const data = await graphql<RepositoryInfo>(query, {
    owner: OWNER,
    repo: REPO,
  });

  const category = data.repository.discussionCategories.nodes.find(
    (c) =>
      c.name.toLowerCase() === categoryName.toLowerCase() ||
      c.slug.toLowerCase() === categoryName.toLowerCase(),
  );

  if (!category) {
    throw new Error(
      `Discussion category "${categoryName}" not found in ${OWNER}/${REPO}`,
    );
  }

  return {
    repositoryId: data.repository.id,
    categoryId: category.id,
  };
}

async function createDiscussion(
  repositoryId: string,
  categoryId: string,
  title: string,
  body: string,
): Promise<{ id: string; url: string; title: string }> {
  const mutation = `
    mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {
        repositoryId: $repositoryId,
        categoryId: $categoryId,
        title: $title,
        body: $body
      }) {
        discussion {
          id
          url
          title
        }
      }
    }
  `;

  const data = await graphql<CreatedDiscussion>(mutation, {
    repositoryId,
    categoryId,
    title,
    body,
  });

  return data.createDiscussion.discussion;
}

/**
 * Create a discussion under the Announcements category for a release.
 *
 * @param release - The release object containing tag_name, name, body, and html_url
 * @param notesUrl - URL to the full release notes page
 * @returns The created discussion info with id, url, and title
 *
 * @throws Error if GITHUB_BOT_TOKEN is not set or if the Announcements category doesn't exist
 */
async function createReleaseAnnouncement(
  release: Release,
  notesUrl: string,
): Promise<{ id: string; url: string; title: string }> {
  if (!GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_BOT_TOKEN is not configured. Cannot create discussion.",
    );
  }

  const { repositoryId, categoryId } =
    await getRepositoryAndCategoryId("Announcements");

  const title = `🚀 ${release.name || release.tag_name} Released!`;

  const body = `## ${release.name || release.tag_name}

${release.body || ""}

---

📦 **[View Release on GitHub](${release.html_url})**

📝 **[Full Release Notes](${notesUrl})**
`;

  return await createDiscussion(repositoryId, categoryId, title, body);
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

  const notesMd = `### See full release notes: [here](${notesUrl})\n`;
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

/**
 * Add all configured reactions to a given release.
 *
 * Description:
 * - Attempts to add each reaction listed in `REACTIONS` to the specified
 *   GitHub release. Each reaction attempt is performed independently and the
 *   function aggregates results so callers can observe which reactions
 *   succeeded or failed.
 *
 * Behavioural notes:
 * - Uses the GitHub Reactions API which requires a special Accept header.
 * - If the `GITHUB_BOT_TOKEN` environment variable is not present this
 *   function throws immediately to indicate missing credentials.
 * - The function returns a summary rather than throwing on individual reaction
 *   failures so it is suitable for best-effort automation tasks.
 *
 * @param releaseId - numeric ID of the GitHub release to react to
 * @returns An object with the shape:
 *   {
 *     success: string[]; // reaction names that were successfully added
 *     failed: Array<{ reaction: string; reason: string }>; // failed attempts
 *     raw: unknown[]; // the raw Promise.allSettled results for debugging
 *   }
 *
 * @example
 * const summary = await addAllReactionsToRelease(123456);
 * console.log('Added reactions:', summary.success);
 *
 * @throws Error if `GITHUB_BOT_TOKEN` is not configured
 */
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

/**
 * Synchronise a GitHub release by appending a release-notes URL and adding reactions.
 *
 * Description:
 * - Fetches the release matching `releaseTag`.
 * - If `notesUrl` is not present in the release body, prepends a short
 *   \"See full release notes\" markdown link and updates the release via PATCH.
 * - Attempts to add a predefined set of reactions to the release and returns
 *   both the updated release object and a summary of reaction attempts.
 *
 * Behavioural notes:
 * - The function will throw if the `GITHUB_BOT_TOKEN` environment variable is
 *   not available since authenticated API calls are required.
 * - Reaction additions are best-effort; failures to add reactions are
 *   captured in the `reactions` summary rather than causing the whole call to fail.
 *
 * @param releaseTag - the git tag name for the release (e.g. \"v1.2.3\")
 * @param notesUrl - publicly accessible URL pointing to the full release notes
 * @param options - optional settings:
 *   - createDiscussion: boolean (default: true) - whether to create a discussion
 *     announcement for the release under the Announcements category.
 * @returns Promise resolving to:
 *   {
 *     release: Release; // the updated release object from GitHub
 *     reactions: unknown; // summary of reaction attempts (see addAllReactionsToRelease)
 *   }
 *
 * @example
 * const result = await syncReleaseWithNotes('v1.0.0', 'https://plazen.org/release-notes/abc123');
 * console.log(result.release.html_url, result.reactions);
 *
 * @throws Error when `GITHUB_BOT_TOKEN` is missing
 */
export async function syncReleaseWithNotes(
  releaseTag: string,
  notesUrl: string,
  options: { createDiscussion?: boolean } = { createDiscussion: true },
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

  let discussionResult:
    | { id: string; url: string; title: string }
    | { error: string }
    | null = null;
  if (options.createDiscussion !== false) {
    try {
      discussionResult = await createReleaseAnnouncement(
        updatedRelease,
        notesUrl,
      );
    } catch (err) {
      discussionResult = { error: (err as Error).message || String(err) };
    }
  }

  return {
    release: updatedRelease,
    reactions: reactionsSummary,
    discussion: discussionResult,
  };
}

/**
 * Attempt to synchronise a release and return an explicit error object on failure.
 *
 * Description:
 * - Convenience wrapper around `syncReleaseWithNotes` that captures thrown
 *   errors, logs them, and returns a normalized `{ error: string }` object
 *   instead of propagating exceptions. Useful for background tasks where a
 *   failure should be observed but not crash the orchestration.
 *
 * @param releaseTag - the release tag to sync (e.g. \"v2.0.0\")
 * @param notesUrl - URL to the full release notes
 * @returns Promise resolving to either the successful result of `syncReleaseWithNotes`
 *          or an object `{ error: string }` describing the failure.
 *
 * @example
 * const outcome = await trySyncReleaseWithNotes('v1.2.3', 'https://plazen.org/notes/xyz');
 * if ('error' in outcome) {
 *   console.error('Sync failed:', outcome.error);
 * } else {
 *   console.log('Sync succeeded:', outcome.release.html_url);
 * }
 */
export async function trySyncReleaseWithNotes(
  releaseTag: string,
  notesUrl: string,
  options: { createDiscussion?: boolean } = { createDiscussion: true },
) {
  try {
    return await syncReleaseWithNotes(releaseTag, notesUrl, options);
  } catch (error) {
    console.error("GitHub bot sync failed:", error);
    return { error: (error as Error).message || error };
  }
}
