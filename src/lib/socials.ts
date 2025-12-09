interface ReleaseNoteDetails {
  id: string;
  version: string;
  topic: string;
}

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

function formatReleaseMessage(note: ReleaseNoteDetails): string {
  return `✨ Version ${note.version} released!

${note.topic}

See more: https://plazen.org/release-notes/${note.id}
Release: https://github.com/plazen/plazen/releases/tag/${note.version}

Have a good day! ❤️

#plazen #opensource #release #plazenorg`;
}
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
