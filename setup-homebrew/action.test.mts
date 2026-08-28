import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, it } from "node:test";
import * as yaml from "js-yaml";

type Action = {
  inputs: Record<string, { description: string; required?: boolean; default?: unknown }>;
};

const action = yaml.load(
  fs.readFileSync(new URL("action.yml", import.meta.url), "utf8"),
) as Action;

function parseTapVariables(env: Record<string, string>, tapArg = "", parentRepo = ""): {
  tapName: string;
  tapRepo: string;
  stable: string;
} {
  const script = `
HOMEBREW_PREFIX="/opt/homebrew"
HOMEBREW_REPOSITORY="/opt/homebrew"
HOMEBREW_CORE_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/homebrew/homebrew-core"
HOMEBREW_CASK_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/homebrew/homebrew-cask"
TAP="${tapArg}"
PARENT_REPO="${parentRepo}"
STABLE="auto"

if [[ -n "\${TAP}" ]]; then
    if [[ "\${TAP}" =~ ^([^/]+)/homebrew-(.+)$ ]]; then
        HOMEBREW_TAP_NAME="$(echo "\${BASH_REMATCH[1]}/\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
        HOMEBREW_TAP_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/$(echo "\${BASH_REMATCH[1]}/homebrew-\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
    elif [[ "\${TAP}" =~ ^([^/]+)/(.+)$ ]]; then
        HOMEBREW_TAP_NAME="$(echo "\${BASH_REMATCH[1]}/\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
        HOMEBREW_TAP_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/$(echo "\${BASH_REMATCH[1]}/homebrew-\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
    fi
elif [[ "$GITHUB_REPOSITORY" =~ ^.+/(home|linux)brew-core$ || "$PARENT_REPO" =~ ^.+/(home|linux)brew-core$ ]]; then
    HOMEBREW_TAP_NAME="homebrew/core"
    HOMEBREW_TAP_REPOSITORY="$HOMEBREW_CORE_REPOSITORY"
elif [[ "$GITHUB_REPOSITORY" =~ ^.+/homebrew-cask$ || "$PARENT_REPO" =~ ^.+/homebrew-cask$ ]]; then
    HOMEBREW_TAP_NAME="homebrew/cask"
    HOMEBREW_TAP_REPOSITORY="$HOMEBREW_CASK_REPOSITORY"
elif [[ "$GITHUB_REPOSITORY" =~ ^([^/]+)/homebrew-(.+)$ ]]; then
    HOMEBREW_TAP_NAME="$(echo "\${BASH_REMATCH[1]}/\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
    HOMEBREW_TAP_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/$(echo "$GITHUB_REPOSITORY" | tr "[:upper:]" "[:lower:]")"
elif [[ "$GITHUB_REPOSITORY" =~ ^([^/]+)/.+-homebrew-(.+)$ ]]; then
    HOMEBREW_TAP_NAME="$(echo "\${BASH_REMATCH[1]}/\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
    HOMEBREW_TAP_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/$(echo "\${BASH_REMATCH[1]}/homebrew-\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
elif [[ "$GITHUB_REPOSITORY" =~ ^([^/]+)/(.+)-homebrew$ ]]; then
    HOMEBREW_TAP_NAME="$(echo "\${BASH_REMATCH[1]}/\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
    HOMEBREW_TAP_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/$(echo "\${BASH_REMATCH[1]}/homebrew-\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
elif [[ "$PARENT_REPO" =~ ^([^/]+)/homebrew-(.+)$ ]]; then
    current_owner="\${GITHUB_REPOSITORY%%/*}"
    HOMEBREW_TAP_NAME="$(echo "\${current_owner}/\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
    HOMEBREW_TAP_REPOSITORY="$HOMEBREW_REPOSITORY/Library/Taps/$(echo "\${current_owner}/homebrew-\${BASH_REMATCH[2]}" | tr "[:upper:]" "[:lower:]")"
fi

if [[ "\${STABLE}" == "auto" ]]; then
    if [[ -z "\${HOMEBREW_TAP_REPOSITORY-}" && ! "$GITHUB_REPOSITORY" =~ ^.+/brew$ ]]; then
        STABLE="true"
    else
        STABLE="false"
    fi
fi

echo "TAP_NAME=\${HOMEBREW_TAP_NAME-}"
echo "TAP_REPO=\${HOMEBREW_TAP_REPOSITORY-}"
echo "STABLE=\${STABLE}"
`;

  const output = execFileSync("/bin/bash", ["-c", script], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  const parsed = Object.fromEntries(
    output.trim().split("\n").map((line) => line.split("=", 2)),
  );
  return {
    tapName: parsed.TAP_NAME,
    tapRepo: parsed.TAP_REPO,
    stable: parsed.STABLE,
  };
}

describe("setup-homebrew action", () => {
  it("defines tap input in action.yml", () => {
    assert.ok(action.inputs.tap);
    assert.equal(action.inputs.tap.required, false);
  });

  it("resolves tap for standard upstream tap repository", () => {
    const result = parseTapVariables({ GITHUB_REPOSITORY: "JakeWharton/homebrew-repo" });
    assert.equal(result.tapName, "jakewharton/repo");
    assert.equal(result.tapRepo, "/opt/homebrew/Library/Taps/jakewharton/homebrew-repo");
    assert.equal(result.stable, "false");
  });

  it("automatically resolves tap for forked infix homebrew repository like Goooler/jw-homebrew-repo", () => {
    const result = parseTapVariables({ GITHUB_REPOSITORY: "Goooler/jw-homebrew-repo" });
    assert.equal(result.tapName, "goooler/repo");
    assert.equal(result.tapRepo, "/opt/homebrew/Library/Taps/goooler/homebrew-repo");
    assert.equal(result.stable, "false");
  });

  it("resolves tap for forked tap repository with custom tap input", () => {
    const result = parseTapVariables(
      { GITHUB_REPOSITORY: "Goooler/custom-repo-name" },
      "Goooler/repo",
    );
    assert.equal(result.tapName, "goooler/repo");
    assert.equal(result.tapRepo, "/opt/homebrew/Library/Taps/goooler/homebrew-repo");
    assert.equal(result.stable, "false");
  });

  it("resolves tap for forked repository via parent repo metadata", () => {
    const result = parseTapVariables(
      { GITHUB_REPOSITORY: "Goooler/custom-repo-name" },
      "",
      "JakeWharton/homebrew-repo",
    );
    assert.equal(result.tapName, "goooler/repo");
    assert.equal(result.tapRepo, "/opt/homebrew/Library/Taps/goooler/homebrew-repo");
    assert.equal(result.stable, "false");
  });

  it("resolves tap for forked homebrew-core repository", () => {
    const result = parseTapVariables({ GITHUB_REPOSITORY: "Goooler/homebrew-core" });
    assert.equal(result.tapName, "homebrew/core");
    assert.equal(result.tapRepo, "/opt/homebrew/Library/Taps/homebrew/homebrew-core");
    assert.equal(result.stable, "false");
  });

  it("resolves tap for forked homebrew-cask repository", () => {
    const result = parseTapVariables({ GITHUB_REPOSITORY: "Goooler/homebrew-cask" });
    assert.equal(result.tapName, "homebrew/cask");
    assert.equal(result.tapRepo, "/opt/homebrew/Library/Taps/homebrew/homebrew-cask");
    assert.equal(result.stable, "false");
  });

  it("resolves non-tap repository as stable", () => {
    const result = parseTapVariables({ GITHUB_REPOSITORY: "Homebrew/actions" });
    assert.equal(result.tapName, "");
    assert.equal(result.tapRepo, "");
    assert.equal(result.stable, "true");
  });
});
