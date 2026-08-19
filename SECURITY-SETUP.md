# Security setup — current status

## Vendor libraries are now fully self-hosted

Earlier versions of this site loaded JSZip, pdf-lib, pdf.js, and ffmpeg.wasm
from public CDNs (cdnjs, jsDelivr), which meant every visitor's browser
trusted those third parties to serve unmodified code on every page load.
That previously required Subresource Integrity (SRI) hashes as a mitigation,
with two files (`pdf.worker.min.js` and `ffmpeg-core.js`/`ffmpeg-core.wasm`)
that couldn't get SRI at all because they're fetched dynamically by their
parent libraries rather than via a `<script src>` tag we control.

That whole problem is now resolved differently: **every vendor library is
downloaded once from the npm registry and shipped as part of this site's
own files**, under `/vendor/`. Same-origin resources don't need SRI —
there's no third party in the loop at request time to compromise. This is
a stronger position than "CDN + correct SRI hash" would have been, not just
a workaround for the two files that couldn't get hashes.

## What this means for updates

Because these are no longer live CDN links, they will **not** automatically
receive security patches. If a CVE is published against JSZip, pdf-lib,
pdf.js, or ffmpeg.wasm, updating means re-running the same install-and-copy
process against a newer version — it won't happen on its own the way a CDN
reference might appear to (though pinning exact CDN versions, which this
site always did, means the auto-update illusion wasn't real then either).

**To update a vendor library:**
```
mkdir vendor-update && cd vendor-update
npm init -y
npm install jszip@<new-version>   # or pdf-lib / pdfjs-dist / @ffmpeg/ffmpeg / @ffmpeg/core
```
Then copy the relevant built file(s) from `node_modules/<package>/dist/`
(or `/build/` for pdfjs-dist) over the matching file under `/vendor/`.

## Vendor file map

| Library | Files | Used for |
|---|---|---|
| JSZip 3.10.1 | `vendor/jszip/jszip.min.js` | Batch ZIP downloads |
| pdf-lib 1.17.1 | `vendor/pdf-lib/pdf-lib.min.js` | All PDF creation/editing |
| pdf.js 3.11.174 | `vendor/pdfjs/pdf.min.js`, `pdf.worker.min.js` | PDF page rendering/preview |
| ffmpeg.wasm 0.11.6 | `vendor/ffmpeg/ffmpeg.min.js`, `046d0074eee1d99a674a.js` | Video watermarking (loader) |
| ffmpeg-core 0.11.0 | `vendor/ffmpeg-core/ffmpeg-core.js`, `.wasm`, `.worker.js` | Video watermarking (engine) |
| pdf-encrypt-lite 1.2.0 | `vendor/pdf-encrypt-lite/pdf-encrypt-lite.umd.js` | Protect PDF (add password) |
| pdf-decrypt (latest) | `vendor/pdf-decrypt/*.mjs`, `vendor/pdf-lib/pdf-lib.esm.min.js` | Unlock PDF (remove known password) |

### A note on the Unlock PDF module specifically

`pdf-decrypt` only ships as an ES module (no UMD/browser-global build like
the other vendor libraries have), and its source has a bare `import ... from
'pdf-lib'` that browsers can't resolve without either an import map or a
patched path. Rather than add an import map, `pdf-decrypt.mjs` was directly
edited in the vendor copy to import from `../pdf-lib/pdf-lib.esm.min.js`
instead of the bare `'pdf-lib'` specifier — this is why `pdf-lib` appears
twice in `/vendor/` (once as `pdf-lib.min.js`, the classic global build used
by every other tool, and once as `pdf-lib.esm.min.js`, used only by this
module). A small bridge file, `vendor/pdf-decrypt/bridge.mjs`, then loads as
`<script type="module" src="...">` and assigns the library's exports onto
`window.PDFDecryptLite`, so the rest of the site's classic scripts can call
it the same way they call every other vendor library.

**If updating `pdf-decrypt` to a newer version**, this patch needs to be
reapplied: after copying the new `.mjs` files, re-edit `pdf-decrypt.mjs`'s
top import line to point at `../pdf-lib/pdf-lib.esm.min.js`.

Each vendor folder includes the library's original LICENSE file — keep
these when deploying; all are MIT-licensed and require attribution to stay
compliant.

## Deployment note

The `vendor/` folder (~26MB, almost entirely `ffmpeg-core.wasm`) must be
uploaded alongside the other site files, preserving the folder structure
exactly — the JS references paths like `vendor/pdfjs/pdf.worker.min.js`
relative to the site root.

## Remaining security posture (unchanged from before)

- CSP, security headers (`vercel.json` / `_headers`), and the service worker
  hardening are all still in place and were updated in this pass to drop
  the now-unnecessary CDN domains from the allowlist — the policy is
  actually *tighter* now, not just equivalent.
- No server, no database, no file uploads processed anywhere but the
  visitor's own browser — this remains the core security property of the
  whole site.
