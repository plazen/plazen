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
              const newCommit = Object.assign({}, commit); // Shallow copy

              delete newCommit.committerDate;

              if (newCommit.author) {
                // Break reference to the original immutable author object
                newCommit.author = Object.assign({}, newCommit.author);
                delete newCommit.author.date;
              }
              if (newCommit.committer) {
                // Break reference to the original immutable committer object
                newCommit.committer = Object.assign({}, newCommit.committer);
                delete newCommit.committer.date;
              }

              newCommit.emoji = emojiForType[type] || "🔹";

              if (!newCommit.originalType) {
                newCommit.originalType = newCommit.type;
              }
              newCommit.type = `${newCommit.emoji} ${newCommit.originalType || type}`;

              // Clean up subject: remove trailing ", closes #XX" and empty "()"
              if (newCommit.subject) {
                newCommit.subject = newCommit.subject
                  .replace(/,?\s*closes\s+#\d+/gi, "")
                  .replace(/\(\s*\)/g, "")
                  .trim();
              }

              const author = newCommit.author || newCommit.committer || {};
              if (author) {
                // Prefer GitHub username/login over display name
                const username = author.login || author.username;
                const email = author.email;
                if (username) {
                  const url =
                    (context.host || "https://github.com") + "/" + username;
                  if (!contributors.has(username)) {
                    contributors.set(username, {
                      name: author.name || username,
                      username,
                      email,
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
                  if (info.username) {
                    const emailPart = info.email
                      ? ` - [${info.email}](mailto:${info.email})`
                      : "";
                    lines.push(`- @${info.username}${emailPart}`);
                  } else {
                    lines.push(`- ${info.name}`);
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
