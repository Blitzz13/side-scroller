# Agent Guidelines & Context Constraints

## File Access & Token Optimization Rules
To preserve the agent context budget and avoid reading bloated/binary files into context:

1. **Binary & Media Files**:
   - Never use `read_file` or inspect binary image/audio files directly (`.png`, `.jpg`, `.jpeg`, `.webp`, `.mp3`, `.wav`).
   - For image and sprite dimensions, check their corresponding JSON descriptor/metadata or asset configs in `src/configs/`.

2. **Build Outputs & Bundles**:
   - Do not search or read files inside `dist/`, `.cache/`, or `node_modules/`.
   - Always reference source code under `src/` and assets under `assets/`.

3. **Lockfiles & Documentation Logs**:
   - Avoid reading full `package-lock.json` or `CHANGELOG.md` without line limits (`StartLine`/`EndLine`).
   - Refer to `.agentignore` and `.geminiignore` for ignored paths.
