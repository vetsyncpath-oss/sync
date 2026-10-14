# Third-party notices

Selected URL/query helpers in `src/sources/gdrive-client.ts` are adapted from
`hesprs/sync-engine`, commit `a795a46abe8b6d6fc6a319152cda1b65cfc9c8b9`,
`packages/gdrive/src/gdrive/api.ts`, under the MIT License.
The complete notice is in `licenses/sync-engine-MIT.txt` and must accompany distributions.
The build embeds this full notice in the `main.js` banner, including production builds.

The integration uses its own desktop PKCE flow, profile policy and operation state.
Token refresh coalescing, file ID mapping and resumable upload design were informed by Sync Engine.
The donor SDK, module binaries, OAuth credentials, UI framework and documentation are not bundled.
