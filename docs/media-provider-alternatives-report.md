# Media Provider Alternatives (100% Free / Open Source, Report Only)

Date: February 23, 2026

Scope: report-only review of free/open-source media storage and delivery alternatives.  
Constraint respected: no replacement of current providers in this pass.

## Current state (kept)

- Cloudinary remains in use for production media upload and delivery.
- No provider replacement was performed in this update.

## Candidate alternatives (free/open-source)

1. MinIO (self-hosted, S3-compatible)
- Type: Object storage server.
- License: AGPLv3.
- Cost model: self-hosted (infrastructure only).
- Fit: direct replacement target for image/video upload APIs with signed URL support.

2. SeaweedFS (self-hosted distributed storage)
- Type: distributed file/object store.
- License: Apache 2.0.
- Cost model: self-hosted.
- Fit: high-scale media workloads with low-latency volume servers.

3. Ceph RGW (self-hosted object gateway)
- Type: distributed object storage.
- License: LGPL/GPL (Ceph project).
- Cost model: self-hosted.
- Fit: enterprise-grade durability and multi-zone deployments.

4. Nginx + local/object backend + Thumbor/imgproxy
- Type: composable OSS media pipeline.
- License: OSS (Nginx BSD-like, Thumbor Apache 2.0, imgproxy MIT).
- Cost model: self-hosted.
- Fit: image transformation and CDN-like caching without paid SaaS.

5. Appwrite Storage (self-hosted)
- Type: application backend with object storage APIs.
- License: BSD-3-Clause.
- Cost model: self-hosted.
- Fit: fast integration if broader Appwrite adoption is desired.

## Recommendation for future migration (non-breaking strategy)

1. Introduce adapter layer first
- Keep current upload interface stable.
- Route writes via `MediaProviderAdapter` that can target current provider or OSS backend.

2. Read-only shadow mode
- Mirror new uploads to OSS storage while still serving from current provider.
- Compare integrity and latency metrics.

3. Controlled read switch
- Feature-flag traffic by asset class (images first, then video).
- Roll back instantly by flipping adapter target.

4. Full cutover only after parity
- Validate signed URL expiry, transformations, retries, and backup/restore behavior.

## Decision

- No replacement executed in this pass.
- All options above are 100% free/open-source and self-hostable.
