# Third-party software in this folder

The Python card runs these unmodified, pinned files entirely in your browser.

| Component | Version | Licence |
|---|---|---|
| [Pyodide](https://github.com/pyodide/pyodide) (`pyodide` on npm) | 314.0.7 | MPL-2.0 — source at https://github.com/pyodide/pyodide/tree/314.0.7 |
| [CPython](https://www.python.org/) (inside `pyodide.asm.wasm` and `python_stdlib.zip`) | 3.14.2 | PSF-2.0 |

Packages imported from your code (for example `numpy`) are fetched on demand
from the matching Pyodide release at
`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/` and each is checked against
the SHA-256 recorded in `pyodide-lock.json`; their licences are listed in that
lock file.
