const emojiForType = {
  feat: "✨", // new features
  fix: "🐛", // bug fixes
  docs: "📝", // documentation
  style: "🎨", // code style changes (formatting, lint)
  refactor: "♻️", // refactors
  perf: "⚡️", // performance improvements
  test: "✅", // adding or fixing tests
  chore: "🔧", // chores
  ci: "🔁", // CI-related changes
  build: "🏗️", // build system
  revert: "⏪️", // reverts
};

module.exports = {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",

    [
      "@semantic-release/release-notes-generator",
      {
        writerOpts: {
          issueUrlFormat: "{{host}}/{{owner}}/{{repository}}/issues/{{id}}",
          commitUrlFormat: "{{host}}/{{owner}}/{{repository}}/commit/{{hash}}",
          compareUrlFormat:
            "{{host}}/{{owner}}/{{repository}}/compare/{{previousTag}}...{{currentTag}}",
          userUrlFormat: "{{host}}/{{user}}",

          groupBy: "type",
          commitGroupsSort: "title",
          commitsSort: ["scope", "subject"],
          transform: (commit, context) => {
            context._contributors = context._contributors || new Map();

            const type = commit.type || "other";

            commit.emoji = emojiForType[type] || "🔹";

            if (!commit.originalType) {
              commit.originalType = commit.type;
            }
            commit.type = `${commit.emoji} ${commit.originalType || type}`;

            if (commit.subject) {
              const host = context.host || "https://github.com";
              const owner =
                context.owner ||
                (context.repository ? context.repository.split("/")[0] : "");
              const repo = context.repository || context.packageName || "";
              commit.subject = commit.subject.replace(
                /(?:\s|^)(#)(\d+)\b/g,
                (_, p1, id) => {
                  return ` [#${id}](${host}/${owner}/${repo}/issues/${id})`;
                },
              );
              commit.subject = commit.subject.replace(
                /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)/g,
                (_, repoPath, id) => {
                  return `[${repoPath}#${id}](${host}/${repoPath}/issues/${id})`;
                },
              );
              commit.subject = commit.subject.replace(
                /\(PR\s+#(\d+)\)/gi,
                (_, id) => {
                  return `(PR [#${id}](${host}/${owner}/${repo}/pull/${id}))`;
                },
              );
            }

            const author = commit.author || commit.committer || {};
            if (author) {
              const username = author.username || author.name || author.login;
              if (username) {
                let url;
                if (author.username || author.login) {
                  url = (context.host || "https://github.com") + "/" + username;
                } else if (author.email) {
                  url = `mailto:${author.email}`;
                }
                if (!context._contributors.has(username)) {
                  context._contributors.set(username, {
                    name: author.name || username,
                    username,
                    url,
                  });
                }
              }
            }
            return commit;
          },
          finalizeContext: (context) => {
            const contributors = context._contributors || new Map();
            if (contributors.size > 0) {
              const lines = [];
              for (const [, info] of contributors) {
                if (info.url && info.url.startsWith("http")) {
                  lines.push(
                    `- [${info.username}](${info.url})${info.name && info.name !== info.username ? ` (${info.name})` : ""}`,
                  );
                } else {
                  lines.push(`- ${info.name || info.username}`);
                }
              }
              context.customContributors = lines.join("\n");
            } else {
              context.customContributors = "";
            }
            context.host = context.host || "https://github.com";
            return context;
          },
          footerPartial:
            "{{#if customContributors}}\n\n### 👥 Contributors\n\n{{{customContributors}}}\n{{/if}}",
        },
      },
    ],

    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],

    [
      "@semantic-release/npm",
      {
        npmPublish: false,
        pkgRoot: ".",
      },
    ],
    "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        assets: ["package.json"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};
