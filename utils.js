const getRepoFromProcess = () => process.env['INPUT_REPO'] ?? process.env['GITHUB_REPOSITORY']
const createGetReleasesPath = (fullyQualifiedRepo = getRepoFromProcess()) => `/repos/${fullyQualifiedRepo}/releases`

// The fact that this uses the "createGetReleasesPath" is used in a test, so changes here should be reflected there as
// well.
const createDeleteReleasesPath = (releaseId, fullyQualifiedRepo = getRepoFromProcess()) => `${createGetReleasesPath(fullyQualifiedRepo)}/${releaseId}`
const createDeleteTagPath = (tagRef, fullyQualifiedRepo = getRepoFromProcess()) => `/repos/${fullyQualifiedRepo}/git/${tagRef}`

const createTagRef = (tagName) => `refs/tags/${tagName}`

module.exports = {
  getRepoFromProcess, createGetReleasesPath, createDeleteReleasesPath, createDeleteTagPath, createTagRef
}