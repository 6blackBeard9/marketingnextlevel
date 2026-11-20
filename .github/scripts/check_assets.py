#!/usr/bin/env python3
"""Check that every local file index.html asks for is actually in the repo.

There is no build step here - the page loads its CSS, JS, images and
video straight from the tree. That makes one mistake easy and silent:
referencing a file that exists on the author's disk but never got
committed, because .gitignore excludes the folder it lives in. It
works locally and 404s once deployed. Nothing else would catch it,
so CI does.

Reads any attribute whose value points at a local file, not a fixed
list of them: src and href, but also the data-src the trail lazy-loads
from and the data-media the service cards carry. A list would go stale
the first time a component invents its own attribute name - and that is
exactly the reference nobody would think to check.
"""

import os
import re
import subprocess
import sys

PAGE = "index.html"

# Not ours to resolve: off-site, inline, or in-page.
SKIP_PREFIX = ("http://", "https://", "//", "#", "data:", "mailto:", "tel:")

# Any attribute at all - what makes a value a reference is the value.
ATTRS = re.compile(r"""[\w-]+\s*=\s*["']([^"']+)["']""")

# A local file: either under assets/, or named like a web file.
LOCAL = re.compile(
    r"""(^assets/)|(\.(?:css|js|mjs|png|jpe?g|jfif|webp|avif|gif|svg|ico"""
    r"""|mp4|webm|ogv|mp3|wav|woff2?|ttf|otf|json|html?)$)""",
    re.IGNORECASE,
)


def referenced(path):
    """Local paths the page requests, cache-busters and fragments off."""
    with open(path, encoding="utf-8") as fh:
        html = fh.read()

    out = set()

    for raw in ATTRS.findall(html):
        url = raw.strip()

        if not url or url.startswith(SKIP_PREFIX):
            continue

        clean = url.split("?")[0].split("#")[0]

        if not clean or not LOCAL.search(clean):
            continue

        out.add(clean)

    return out


def tracked():
    """Files git actually has, which is what gets deployed."""
    done = subprocess.run(
        ["git", "ls-files"],
        capture_output=True,
        text=True,
        check=True,
    )

    return {line.strip() for line in done.stdout.splitlines() if line.strip()}


def main():
    if not os.path.exists(PAGE):
        print("cannot find %s - run this from the repo root" % PAGE)
        return 1

    refs = sorted(referenced(PAGE))
    have = tracked()

    missing = []
    untracked = []

    for ref in refs:
        # The page is served from the repo root, so a reference is
        # already the repo-relative path. Normalise separators only.
        rel = ref.replace("\\", "/").lstrip("./")

        if rel in have:
            continue

        if os.path.exists(rel):
            untracked.append(rel)
        else:
            missing.append(rel)

    print("%d local references in %s" % (len(refs), PAGE))

    for rel in untracked:
        print("::error::%s is referenced and on disk but not committed - "
              "it will 404 on the deployed site" % rel)

    for rel in missing:
        print("::error::%s is referenced but does not exist" % rel)

    if untracked or missing:
        print("\n%d broken reference(s)" % (len(untracked) + len(missing)))
        return 1

    print("every referenced file is in the repo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
