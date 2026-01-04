/**
 * socials.ts
 *
 * Utilities to publish release announcements to social platforms (Mastodon, Threads).
 *
 * Exports:
 * - publishToSocials(note): best-effort publisher that attempts to post a release
 *   announcement to configured social platforms. Failures for individual platforms
 *   are logged and do not throw from the batch publisher.
 *
 * Behaviour and notes:
 * - Reads credentials from environment variables:
 *     - Mastodon: MASTODON_INSTANCE_URL, MASTODON_ACCESS_TOKEN
 *     - Threads: THREADS_USER_ID, THREADS_ACCESS_TOKEN
 * - Posts are performed via simple HTTP requests (fetch). These helpers are
 *   intentionally small and synchronous-like; they are suitable for background
 *   tasks or CI announcements but not for rate-sensitive production workloads.
 */

import crypto from "crypto";

interface ReleaseNoteDetails {
  id: string;
  version: string;
  topic: string;
}

/**
 * Publish a release note to supported social platforms.
 *
 * This function formats a short release message and attempts to publish it to
 * Mastodon and Threads in parallel. Each platform is best-effort — failures are
 * logged per-platform and do not prevent the function from returning.
 *
 * @param note - release metadata used to format the outgoing message
 */
export async function publishToSocials(note: ReleaseNoteDetails) {
  const message = formatReleaseMessage(note);

  const results = await Promise.allSettled([
    publishToMastodon(message),
    publishToThreads(message),
  ]);

  results.forEach((result, index) => {
    const platform = index === 0 ? "Mastodon" : "Threads";
    if (result.status === "rejected") {
      console.error(`Failed to publish to ${platform}:`, result.reason);
    } else {
      console.log(`Successfully published to ${platform}`);
    }
  });
}

/**
 * Create the textual message to post for a release.
 *
 * The message contains a short summary, links to release notes and the GitHub
 * release page, and a set of tags used by Plazen.
 */
function formatReleaseMessage(note: ReleaseNoteDetails): string {
  return `✨ Version ${note.version} released!

${note.topic}

See more: https://plazen.org/release-notes/${note.id}
Release: https://github.com/plazen/plazen/releases/tag/${note.version}

Have a good day! ❤️

#plazen #opensource #release #plazenorg`;
}

/**
 * publishToMastodon
 *
 * Post a status update to a Mastodon instance using the /api/v1/statuses endpoint.
 *
 * - Requires MASTODON_INSTANCE_URL and MASTODON_ACCESS_TOKEN to be set.
 * - Uses an Idempotency-Key header to reduce duplicate posts in retry scenarios.
 *
 * Throws on HTTP error to allow the caller to log the failure.
 */
async function publishToMastodon(text: string) {
  const instanceUrl = process.env.MASTODON_INSTANCE_URL;
  const accessToken = process.env.MASTODON_ACCESS_TOKEN;

  if (!instanceUrl || !accessToken) return;

  const response = await fetch(`${instanceUrl}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ status: text, visibility: "public" }),
  });

  if (!response.ok) {
    throw new Error(`Mastodon API error: ${response.statusText}`);
  }
}

/**
 * publishToThreads
 *
 * Publish a simple text-only thread via the Threads API container/publish flow.
 *
 * - Requires THREADS_USER_ID and THREADS_ACCESS_TOKEN environment variables.
 * - The flow first creates a container (POST /threads) then polls until the
 *   container is ready, and finally publishes via threads_publish.
 *
 * Throws on HTTP error to allow the caller to log the failure.
 */
async function publishToThreads(text: string) {
  const userId = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;

  if (!userId || !accessToken) {
    console.warn("Threads credentials missing, skipping post.");
    return;
  }

  const containerUrl = `https://graph.threads.net/v1.0/${userId}/threads`;
  const containerRes = await fetch(containerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      media_type: "TEXT",
      text: text,
    }),
  });

  if (!containerRes.ok) {
    const error = await containerRes.text();
    throw new Error(`Threads Container Creation Failed: ${error}`);
  }

  const { id: creationId } = await containerRes.json();
  console.log(
    `Threads Container Created: ${creationId}. Waiting for readiness...`,
  );

  await waitForContainer(creationId, accessToken);

  const publishUrl = `https://graph.threads.net/v1.0/${userId}/threads_publish`;
  const publishRes = await fetch(publishUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      creation_id: creationId,
    }),
  });

  if (!publishRes.ok) {
    const error = await publishRes.text();
    throw new Error(`Threads Publish Failed: ${error}`);
  }

  console.log("Threads post published successfully.");
}

/**
 * waitForContainer
 *
 * Poll the Threads container status endpoint until processing has finished or
 * an error/timeout occurs.
 *
 * - Retries up to `maxAttempts` with a fixed delay.
 * - Throws if the container enters an ERROR state or if the timeout is reached.
 */
async function waitForContainer(creationId: string, accessToken: string) {
  let attempts = 0;
  const maxAttempts = 12;
  const delay = 5000;

  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, delay));

    try {
      const statusUrl = `https://graph.threads.net/v1.0/${creationId}?fields=status,error_message&access_token=${accessToken}`;
      const res = await fetch(statusUrl);

      if (!res.ok) {
        console.warn(
          `Container status check failed (${res.status}), retrying...`,
        );
        attempts++;
        continue;
      }

      const data = await res.json();
      const status = data.status;

      console.log(`Container ${creationId} status: ${status}`);

      if (status === "FINISHED") {
        return; // Ready to publish!
      } else if (status === "ERROR") {
        throw new Error(`Container processing failed: ${data.error_message}`);
      }
    } catch (e) {
      console.warn("Error checking container status:", e);
    }

    attempts++;
  }

  throw new Error("Timeout waiting for Threads container to be ready.");
}
