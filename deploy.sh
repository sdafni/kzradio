#!/usr/bin/env bash
# Local git → GitHub → GitHub Pages, in one shot.
# Usage:   bash deploy.sh [repo-name]    (default: kzradio)
#
# Requires the GitHub CLI (`gh`) authenticated as you. If you don't have it:
#   brew install gh && gh auth login
# (Or follow the manual steps the script prints when gh is missing.)

set -euo pipefail

REPO_NAME="${1:-kzradio}"
cd "$(dirname "$0")"

# --- 1. clean up state from any previous attempt --------------------------
rm -f .git/index.lock 2>/dev/null || true

# --- 2. init repo if needed -----------------------------------------------
if [ ! -e .git/HEAD ]; then
  git init -b main
  git config user.email "${GIT_AUTHOR_EMAIL:-yuval@diversion.dev}"
  git config user.name  "${GIT_AUTHOR_NAME:-Yuval}"
fi

# --- 3. honor .gitignore even if files were staged before it existed ------
git rm --cached -r --ignore-unmatch \
  .claude .vscode .venv __pycache__ \
  sample-data.json scrape.log scrape.py 2>/dev/null || true
git add -A

# --- 4. commit if there's anything ----------------------------------------
if git diff --cached --quiet 2>/dev/null && git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Nothing to commit."
else
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    git commit -m "Update"
  else
    git commit -m "Initial commit: KZRadio on-demand client-side picker"
  fi
fi

# --- 5. push to GitHub ----------------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
  cat <<'EOF'

gh CLI not installed. Install it (`brew install gh && gh auth login`) and
re-run, or do these steps manually:

  1. Create a new repo at https://github.com/new (name suggested below).
  2. git remote add origin https://github.com/<your-user>/<repo>.git
  3. git push -u origin main
  4. Repo → Settings → Pages → Build and deployment → Source: "Deploy from
     a branch" → Branch: main / root → Save.

Repo name to use: $REPO_NAME
EOF
  exit 0
fi

OWNER="$(gh api user --jq .login)"

if gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  echo "Repo $OWNER/$REPO_NAME already exists — pushing to it."
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
  fi
  git push -u origin main
else
  echo "Creating $OWNER/$REPO_NAME and pushing…"
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
fi

# --- 6. enable Pages (idempotent) -----------------------------------------
echo "Enabling GitHub Pages…"
if gh api "/repos/$OWNER/$REPO_NAME/pages" >/dev/null 2>&1; then
  echo "Pages already enabled."
else
  gh api -X POST "/repos/$OWNER/$REPO_NAME/pages" \
    -f 'source[branch]=main' -f 'source[path]=/' >/dev/null \
    && echo "Pages enabled." \
    || echo "Could not auto-enable Pages — go to Settings → Pages and pick main / root."
fi

URL="https://$OWNER.github.io/$REPO_NAME/"
echo
echo "Done."
echo "  Repo:  https://github.com/$OWNER/$REPO_NAME"
echo "  Pages: $URL  (give it ~30s to build)"
echo
echo "On your phone, open the Pages URL in Safari/Chrome and use Add to Home Screen."
