# ARVEN — Phase 07 Security Governance & Asset Quarantine Policy

> **Execution Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `8d7a8951-be26-459a-a174-ce527e7bde39` (`governance-lead`)  
> **Governing Baselines:** [`AGENTS.md`](../AGENTS.md), [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md), [`docs/THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md)

## 1. Threat `T-06` Asset Quarantine & Validation Controls

1. **Random Server-Generated Object Keys:** Presign routes ignore client filenames/paths when computing object storage keys (`staging/3d/{assetId}/{uuid}.glb` -> `products/{slug}/v{000N}/model.glb` and `model-lite.glb`). Path traversal (`..`), backslash `\`, null bytes, and drive prefixes reject cleanly.
2. **Binary GLB Verification Gate:** Both the API `confirm` validation fast-path (when localfs/in-process fallback or queued run executes) and BullMQ `3d-assets` worker execute strict binary `.glb` validation:
   - Magic header `glTF` (`0x46546C67` LE), `version === 2`, `byteLength === buffer.byteLength`, strictly sequential JSON (`0x4E4F534A`) and optional BIN (`0x004E4942`) chunks within buffer bounds.
   - Reject polyglots (`<script`, `<!DOCTYPE`, `<html`, `javascript:`, `MZ`, `\x7fELF`), non-embedded external URIs (`http://`, `https://`, `file://`, `//`), oversized binaries (`default > 10 MB`, `lite > 3.5 MB`, staging `> 15 MB`), or triangle counts exceeding `80,000` (`default`) / `25,000` (`lite`).
   - Verify every declared `materialSlots` entry exists in parsed glTF nodes/meshes/materials before transitioning to `AssetStatus.READY`.
3. **Upload State Machine Enforcement:** Unvalidated or `FAILED` `Product3DAsset` rows CANNOT be published (`422 INVALID_STATE_TRANSITION`). Unauthenticated public callers requesting unpublished products or non-`READY` assets receive `404 RESOURCE_NOT_FOUND`.
4. **CSP & Download Headers:** Binary `.glb` responses from `/api/v1/3d-assets/:id/model*` emit `Content-Type: model/gltf-binary`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`. Storefront & Admin `proxy.ts` CSP explicitly permits `worker-src 'self' blob:` for self-hosted Draco/KTX2 web workers without external CDNs.

## 2. Granular RBAC Matrix (`asset.*`) & Telemetry Privacy

| Role | `asset.read` | `asset.upload` | `asset.publish` | `analytics.read` / `.limited` |
|---|---|---|---|---|
| `OWNER` | Allow | Allow | Allow | Full |
| `MANAGER` | Allow | Allow | Allow | Full |
| `PRODUCT` | Allow | Allow | Allow | — (`403`) |
| `CONTENT` | Allow | — (`403`) | — (`403`) | — (`403`) |
| `INVENTORY`, `ORDER`, `SUPPORT`, `CUSTOMER` | — (`403`) | — (`403`) | — (`403`) | Scoped / — |

All 3D telemetry events submitted to `POST /api/v1/3d-assets/telemetry` are strictly pseudonymous/aggregate (`eventType`, `productId`, `assetId`, `version`, `deviceTier`, `presetCode`, `cameraPreset`, `errorCode`, `durationMs`) and NEVER accept or log email, phone, name, IP, or cookies.
