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
        writerOpts: (function () {
          const contributors = new Map();
          return {
            issueUrlFormat: "{{host}}/{{owner}}/{{repository}}/issues/{{id}}",
            commitUrlFormat:
              "{{host}}/{{owner}}/{{repository}}/commit/{{hash}}",
            compareUrlFormat:
              "{{host}}/{{owner}}/{{repository}}/compare/{{previousTag}}...{{currentTag}}",
            userUrlFormat: "{{host}}/{{user}}",

            groupBy: "type",
            commitGroupsSort: "title",
            commitsSort: ["scope", "subject"],
            transform: (commit, context) => {
              const type = commit.type || "other";
              const newCommit = Object.assign({}, commit);

              if (newCommit.committerDate) {
                newCommit.committerDate = new Date(
                  newCommit.committerDate,
                ).toISOString();
              }

              if (newCommit.author) {
                newCommit.author = Object.assign({}, newCommit.author);
                if (newCommit.author.date) {
                  newCommit.author.date = new Date(
                    newCommit.author.date,
                  ).toISOString();
                }
              }

              if (newCommit.committer) {
                newCommit.committer = Object.assign({}, newCommit.committer);
                if (newCommit.committer.date) {
                  newCommit.committer.date = new Date(
                    newCommit.committer.date,
                  ).toISOString();
                }
              }

              newCommit.emoji = emojiForType[type] || "🔹";

              if (!newCommit.originalType) {
                newCommit.originalType = newCommit.type;
              }
              newCommit.type = `${newCommit.emoji} ${newCommit.originalType || type}`;

              if (newCommit.subject) {
                const host = context.host || "https://github.com";
                const owner =
                  context.owner ||
                  (context.repository ? context.repository.split("/")[0] : "");
                const repo = context.repository || context.packageName || "";

                newCommit.subject = newCommit.subject.replace(
                  /(?:\s|^)(#)(\d+)\b/g,
                  (_, p1, id) => {
                    return ` [#${id}](${host}/${owner}/${repo}/issues/${id})`;
                  },
                );
                newCommit.subject = newCommit.subject.replace(
                  /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)/g,
                  (_, repoPath, id) => {
                    return `[${repoPath}#${id}](${host}/${repoPath}/issues/${id})`;
                  },
                );
                newCommit.subject = newCommit.subject.replace(
                  /\(PR\s+#(\d+)\)/gi,
                  (_, id) => {
                    return `(PR [#${id}](${host}/${owner}/${repo}/pull/${id}))`;
                  },
                );
              }

              const author = newCommit.author || newCommit.committer || {};
              if (author) {
                const username = author.username || author.name || author.login;
                if (username) {
                  let url;
                  if (author.username || author.login) {
                    url =
                      (context.host || "https://github.com") + "/" + username;
                  } else if (author.email) {
                    url = `mailto:${author.email}`;
                  }
                  if (!contributors.has(username)) {
                    contributors.set(username, {
                      name: author.name || username,
                      username,
                      url,
                    });
                  }
                }
              }
              return newCommit;
            },
            finalizeContext: (context) => {
              const lines = [];
              if (contributors.size > 0) {
                for (const [, info] of contributors) {
                  if (info.url && info.url.startsWith("http")) {
                    lines.push(
                      `- [${info.username}](${info.url})${info.name && info.name !== info.username ? ` (${info.name})` : ""}`,
                    );
                  } else {
                    lines.push(`- ${info.name || info.username}`);
                  }
                }
              }
              const customContributors = lines.length ? lines.join("\n") : "";
              return Object.assign({}, context, {
                customContributors,
                host: context.host || "https://github.com",
              });
            },
            footerPartial:
              "{{#if customContributors}}\n\n### 👥 Contributors\n\n{{{customContributors}}}\n{{/if}}",
          };
        })(),
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
