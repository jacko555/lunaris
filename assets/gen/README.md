# assets/gen — AI-generated art

Images in this tree are generated with OpenAI gpt-image-2 (via Codex CLI)
from the prompts in docs/ASSET-PLAN.md, then post-processed by
tools/strip-chroma.mjs. They are game assets under the repository's asset
license (see assets/), NOT the MIT code license.

Conventions: raw generations keep their manifest name (`<id>__base.png`);
the build consumes only the `@1x`/`@2x` outputs of strip-chroma. Filenames
must match ids in data/base/\*.json exactly.
