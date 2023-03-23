#!/usr/bin/env node

const { getOctokit } = require("@actions/github");

/**
 * @returns {never}
 */
const logAndQuit = (message) => {
  console.error(message);
  process.exit(1);
};

const owner =
  process.env.OWNER ?? logAndQuit("No owner supplied as an env variable");
const repo =
  process.env.REPO ?? logAndQuit("No repo supplied as an env variable");
const token =
  process.env.TOKEN ?? logAndQuit("No token supplied as an env variable");

const octokit = getOctokit(token);
const API_DELAY_MS = 2_500;
const SUPPORTED_COMMANDS = ["create", "check"];

const processOptionPart = (option) => {
  const [name, value] = option.split(":");
  if (name === "tag") {
    return { tag: value };
  }
  if (name === "rel") {
    return { name: value };
  }
  if (name === "dft") {
    return { draft: value === "true" };
  }
  logAndQuit(`Unexpected option part: ${option}`);
};

const isTagOption = (option) => {
  return !!option.tag && !option.name && !option.draft;
};

const isReleaseOption = (option) => {
  return !!option.name;
};
const processArguments = () => {
  const args = process.argv;
  const command = process.argv[2];
  if (!SUPPORTED_COMMANDS.includes(command)) {
    logAndQuit(`Unsupported command: ${command}`);
  }

  const rawOptions = args.slice(3);
  const options = [];

  for (const rawOption of rawOptions) {
    const processedOptions = rawOption.split(",").map(processOptionPart);

    const tag = processedOptions.find((it) => it.tag !== undefined)?.tag;
    const name = processedOptions.find((it) => it.name !== undefined)?.name;
    const draft =
      processedOptions.find((it) => it.draft !== undefined)?.draft ?? false;

    options.push({
      name,
      tag,
      draft,
    });
  }

  options.forEach((option) => {
    if (!isTagOption(option) && !isReleaseOption(option)) {
      logAndQuit(
        `Expected option to be either a tag or release option, got ${JSON.stringify(
          option
        )}`
      );
    }
  });

  return {
    command,
    options,
  };
};

const delay = async (timeoutMs) => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), timeoutMs);
  });
};

const loadExistingReleases = async () => {
  const existingReleases =
    (
      await octokit.rest.repos.listReleases({
        owner,
        repo,
      })
    ).data ?? [];
  console.log(
    `Found ${existingReleases.length} existing release${
      existingReleases.length !== 1 ? "s" : ""
    }`,
    existingReleases.map(({ name }) => name)
  );
  return existingReleases;
};

const loadExistingTags = async () => {
  const existingTags =
    (
      await octokit.rest.repos.listTags({
        owner,
        repo,
      })
    ).data ?? [];
  console.log(
    `Found ${existingTags.length} existing tag${
      existingTags.length !== 1 ? "s" : ""
    }`,
    existingTags.map(({ name }) => name)
  );
  return existingTags;
};
const deleteExistingReleases = async () => {
  const existingReleases = await loadExistingReleases();
  await delay(API_DELAY_MS);

  for (const release of existingReleases) {
    console.log(
      `Deleting release ${release.name} with id ${release.id} pointed at tag ${release.tag_name}`
    );
    await octokit.rest.repos.deleteRelease({
      owner,
      repo,
      release_id: release.id,
    });
    await delay(API_DELAY_MS);
  }
};

const deleteExistingTags = async () => {
  const existingTags = await loadExistingTags();
  await delay(API_DELAY_MS);

  for (const tag of existingTags) {
    console.log(`Deleting tag ${tag.name}`);

    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `tags/${tag.name}`,
    });
    await delay(API_DELAY_MS);
  }
};

const createRelease = async (option) => {
  console.log(
    `Creating ${option.draft ? "draft " : ""}release with name ${
      option.name
    } pointed to tag ${option.tag}`
  );
  await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: option.tag,
    name: option.name,
    draft: option.draft,
  });
};

const createTag = async (option, commitSha) => {
  console.log(`Creating tag with name ${option.tag}`);
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/tags/${option.tag}`,
    sha: commitSha,
  });
};
const runCreate = async (options) => {
  await deleteExistingReleases();
  await deleteExistingTags();

  const hasTagOptions = options.some(isTagOption);
  let tagCommitSha = null;
  if (hasTagOptions) {
    tagCommitSha = (
      await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: "main",
      })
    ).data.commit.sha;
  }

  for (const option of options) {
    if (isReleaseOption(option)) {
      await createRelease(option);
    } else if (isTagOption(option)) {
      await createTag(option, tagCommitSha);
    } else {
      logAndQuit(`Unexpected option: ${option}`);
    }
    await delay(API_DELAY_MS);
  }
};

const checkReleases = async (options) => {
  console.log("Checking for the existence of the following releases:");
  console.log(
    options
      .map(
        ({ tag, name, draft }) => `\tName: ${name} Tag: ${tag} Draft: ${draft}`
      )
      .join("\n")
  );
  const existingReleases = await loadExistingReleases();

  const notFoundReleases = [];
  for (const option of options) {
    const found = existingReleases.find((release) => {
      return (
        release.tag_name === option.tag &&
        release.name === option.name &&
        release.draft === option.draft
      );
    });
    if (!found) {
      notFoundReleases.push(option);
    }
  }

  if (notFoundReleases.length > 0) {
    const formatted = notFoundReleases
      .map(
        ({ name, tag, draft }) => `\tName: ${name} Tag: ${tag} Draft: ${draft}`
      )
      .join("\n");
    return `Some expected releases were not found:\n${formatted}`;
  } else {
    console.log(`All releases were successfully found in ${owner}/${repo}`);
  }
};

const checkTags = async (options) => {
  console.log("Checking for the existence of the following tags");
  console.log(options.map(({ tag }) => `\tTag: \t${tag}`).join("\n"));
  const existingTags = await loadExistingTags();

  const notFound = [];
  for (const option of options) {
    const found = existingTags.find((tag) => {
      return tag.name === option.tag;
    });
    if (!found) {
      notFound.push(option);
    }
  }

  if (notFound.length > 0) {
    const formatted = notFound.map(({ tag }) => `\tTag: ${tag}`).join("\n");
    return `Some expected tags were not found:\n${formatted}`;
  } else {
    console.log(`All tags were successfully found in ${owner}/${repo}`);
  }
};

const runChecks = async (options) => {
  const tagOptions = options.filter(isTagOption);
  const releaseOptions = options.filter(isReleaseOption);

  let hasError = false;
  if (tagOptions) {
    const errorMessage = await checkTags(tagOptions);
    if (errorMessage) {
      hasError = true;
      console.log(errorMessage);
    }
  }

  if (releaseOptions) {
    const errorMessage = await checkReleases(releaseOptions);
    if (errorMessage) {
      hasError = true;
      console.log(errorMessage);
    }
  }

  if (hasError) {
    process.exitCode = 1;
  }
};

const run = async () => {
  const { command, options } = processArguments();
  if (options.length === 0) {
    logAndQuit("No options supplied.");
  }
  console.log(`Operating on repo ${owner}/${repo}`);
  if (command === "create") {
    await runCreate(options);
  } else if (command === "check") {
    await runChecks(options);
  }
};
run();
