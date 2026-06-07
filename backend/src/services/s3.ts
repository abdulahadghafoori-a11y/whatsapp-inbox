/** Re-exports for backward compatibility — use object-storage.ts for new code. */
export {
  ObjectStorageService,
  ObjectStorageService as S3Service,
  buildMediaKey,
  buildRawMediaKey,
} from './object-storage.js'
