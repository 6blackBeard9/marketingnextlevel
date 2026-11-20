#!/usr/bin/env python3
"""Check that every local file the site asks for is actually in the repo.

There is no build step here - the page loads its CSS, JS, images,
audio and video straight from the tree. That makes one mistake easy
and silent: referencing a file that exists on the author's disk but
never got committed, because .gitignore excludes the folder it lives
in. It works locally and 404s once deployed. Nothing else would catch
it, so CI does.

Scans the page and the scripts and stylesheets it loads, because a
reference is a reference wherever it is written: the markup names the
images, but the audio is only ever named inside sound.js.

Within the markup it reads any attribute whose value points at a local
file rather than a fixed list of attribute names - a list goes stale
the first time a component invents its own, and the trail lazy-loads
from data-src while the service cards carry data-media.
"""

import glob
import os
import re
import subprocess
import sys

# Everything that can name a file. The page first, then the code it
# pulls in - which is where paths the markup never mentions live.
SOURCES = ["index.html"] + sorted(
    p.replace("\\", "/")
    for p in glob.glob("assets/js/*.js") + glob.glob("assets/css/*.css")
)

# Not ours to resolve: off-site, inline, or in-page.
SKIP_PREFIX = ("http://", "https://", "//", "#", "data:", "mailto:", "tel:")

# Markup attributes, any name at all - the value decides.
ATTRS = re.compile(r"""[\w-]+\s*=\s*["']([^"']+)["']""")

# Quoted strings in JS, and url() in CSS.
STRINGS = re.compile(r"""["']([^"'\n]+)["']""")
CSS_URL = re.compile(r"""url\(\s*["']?([^)"']+)["']?\s*\)""")

# In code, a path has to look like a path. `three/addons/x.js` ends in
# .js but is a bare module specifier the import map resolves to a CDN -
# nothing the repo is expected to hold. Markup needs no such rule: an
# attribute value is already a URL.
CODE_PATH = ("./", "../", "/", "assets/")

# A local file is one named like a file. Deliberately keyed off the
# extension and not off an "assets/" prefix: code builds paths by
# concatenation, and a bare "assets/" fragment is not a reference.
LOCAL = re.compile(
    r"""\.(?:css|js|mjs|png|jpe?g|jfif|webp|avif|gif|svg|ico"""
    r"""|mp4|webm|ogv|mp3|wav|ogg|woff2?|ttf|otf|json|html?)$""",
    re.IGNORECASE,
)


def candidates(path):
    """Every string in this file that looks like a local file path."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    markup = path.endswith((".html", ".htm"))

    if markup:
        raw = ATTRS.findall(text)
    elif path.endswith(".css"):
        raw = CSS_URL.findall(text)
    else:
        raw = STRINGS.findall(text)

    out = set()

    for item in raw:
        url = item.strip()

        if not url or url.startswith(SKIP_PREFIX):
            continue

        # Cache-busters and fragments are not part of the path
        clean = url.split("?")[0].split("#")[0]

        if not clean or not LOCAL.search(clean):
            continue

        if not markup and not clean.startswith(CODE_PATH):
            continue

        out.add(clean)

    return out


def resolve(ref, source):
    """Where a reference points, as a path from the repo root.

    The page is served from the root, so its own references are
    already root-relative. A stylesheet's url() is relative to the
    stylesheet, which is a different folder.
    """
    rel = ref.replace("\\", "/")

    if rel.startswith("/"):
        return rel.lstrip("/")

    if source.endswith(".css") and not rel.startswith("assets/"):
        rel = os.path.join(os.path.dirname(source), rel).replace("\\", "/")

    return os.path.normpath(rel).replace("\\", "/")


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
    if not os.path.exists("index.html"):
        print("cannot find index.html - run this from the repo root")
        return 1

    have = tracked()

    # path -> the files that ask for it, so an error can say where
    refs = {}

    for source in SOURCES:
        if not os.path.exists(source):
            continue

        for ref in candidates(source):
            refs.setdefault(resolve(ref, source), set()).add(source)

    missing = []
    untracked = []

    for rel in sorted(refs):
        if rel in have:
            continue

        (untracked if os.path.exists(rel) else missing).append(rel)

    print("%d local references across %d source files"
          % (len(refs), len(SOURCES)))

    for rel in untracked:
        print("::error::%s is referenced by %s and exists on disk, but is "
              "not committed - it will 404 on the deployed site"
              % (rel, ", ".join(sorted(refs[rel]))))

    for rel in missing:
        print("::error::%s is referenced by %s but does not exist"
              % (rel, ", ".join(sorted(refs[rel]))))

    if untracked or missing:
        print("\n%d broken reference(s)" % (len(untracked) + len(missing)))
        return 1

    print("every referenced file is in the repo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
