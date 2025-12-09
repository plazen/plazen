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
  // Constructing the message based on your template
  return `✨ Version ${note.version} released!

${note.topic}

See more: https://plazen.org/release-notes/${note.id}
Release: https://github.com/plazen/plazen/releases/tag/${note.version}

Have a good day!

#plazen #opensource #release #plazenorg`;
}

async function publishToMastodon(text: string) {
  const instanceUrl = process.env.MASTODON_INSTANCE_URL; // e.g., https://mastodon.social
  const accessToken = process.env.MASTODON_ACCESS_TOKEN;

  if (!instanceUrl || !accessToken) {
    console.warn("Mastodon credentials missing, skipping post.");
    return;
  }

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
  const containerRes = await fetch(
    `${containerUrl}?media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${accessToken}`,
    {
      method: "POST",
    },
  );

  if (!containerRes.ok) {
    const error = await containerRes.text();
    throw new Error(`Threads Container API error: ${error}`);
  }

  const { id: creationId } = await containerRes.json();

  const publishUrl = `https://graph.threads.net/v1.0/${userId}/threads_publish`;
  const publishRes = await fetch(
    `${publishUrl}?creation_id=${creationId}&access_token=${accessToken}`,
    {
      method: "POST",
    },
  );

  if (!publishRes.ok) {
    const error = await publishRes.text();
    throw new Error(`Threads Publish API error: ${error}`);
  }
}
