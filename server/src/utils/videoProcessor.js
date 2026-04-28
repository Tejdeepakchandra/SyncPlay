/**
 * VideoProcessor — Handles session-end video merging via Cloudinary.
 * 
 * Uses Cloudinary's video concatenation transformation to merge
 * individual moment clips into a single session highlights video.
 * All heavy processing is done by Cloudinary, not our server.
 */
const cloudinaryUtil = require('./cloudinary');

// Cloudinary SDK — same instance as cloudinaryUtil uses internally.
// We need the SDK directly for advanced operations (explicit, api.resource).
const cloudinarySdk = require('cloudinary').v2;

/**
 * Merge multiple video clips into a single video using Cloudinary.
 * Uses the video concatenation/splice transformation.
 * 
 * @param {string[]} clipPublicIds - Cloudinary public IDs of clips to merge (in order)
 * @param {string} outputFolder - Cloudinary folder for the merged output
 * @param {string} roomCode - Room code for naming
 * @returns {object} Cloudinary upload result { secure_url, public_id, duration, bytes, ... }
 */
async function mergeClips(clipPublicIds, outputFolder, roomCode = 'unknown') {
  if (!clipPublicIds || clipPublicIds.length === 0) {
    throw new Error('No clips to merge');
  }

  // If only one clip, just return its info (no merge needed)
  if (clipPublicIds.length === 1) {
    const publicId = clipPublicIds[0];
    try {
      const info = await getVideoInfo(publicId);
      return {
        secure_url: info.secure_url,
        public_id: publicId,
        duration: info.duration,
        bytes: info.bytes,
        width: info.width,
        height: info.height,
        format: info.format,
        singleClip: true
      };
    } catch (error) {
      console.error('Failed to get single clip info:', error.message);
      throw error;
    }
  }

  // Build the splice/overlay transformation for concatenation
  // Cloudinary concatenation: upload with video overlay transformations
  // Each subsequent video is spliced at the end of the previous one
  const spliceTransformations = [];

  // First clip is the base
  // Subsequent clips are spliced at the end using the splice flag
  for (let i = 1; i < clipPublicIds.length; i++) {
    spliceTransformations.push({
      overlay: `video:${clipPublicIds[i].replace(/\//g, ':')}`,
      flags: 'splice',
      width: 1280,
      crop: 'scale'
    });
  }

  // Add a "cut" flag at end to finalize
  spliceTransformations.push({ flags: 'layer_apply' });

  try {
    // Ensure Cloudinary is configured before API calls
    cloudinaryUtil.isConfigured();

    const result = await cloudinarySdk.uploader.explicit(
      clipPublicIds[0],
      {
        type: 'upload',
        resource_type: 'video',
        eager: [
          {
            transformation: spliceTransformations,
            format: 'mp4'
          }
        ],
        eager_async: false,  // Wait for result
      }
    );

    // The eager transformation result has the merged video URL
    const eagerResult = result.eager?.[0];
    if (!eagerResult?.secure_url) {
      throw new Error('Merge transformation failed — no output URL');
    }

    // Upload the merged result as a new permanent resource
    const mergedResult = await cloudinarySdk.uploader.upload(
      eagerResult.secure_url,
      {
        resource_type: 'video',
        folder: outputFolder,
        public_id: `highlights-${roomCode}-${Date.now()}`,
        overwrite: true,
      }
    );

    return {
      secure_url: mergedResult.secure_url,
      public_id: mergedResult.public_id,
      duration: mergedResult.duration,
      bytes: mergedResult.bytes,
      width: mergedResult.width,
      height: mergedResult.height,
      format: mergedResult.format,
    };

  } catch (error) {
    console.error('Merge clips error:', error);

    // Fallback: if Cloudinary merge fails, return a manifest of individual clips
    return {
      secure_url: null,
      public_id: null,
      fallback: true,
      clips: clipPublicIds,
      error: error.message
    };
  }
}

/**
 * Get video info from Cloudinary
 */
async function getVideoInfo(publicId) {
  return cloudinarySdk.api.resource(publicId, {
    resource_type: 'video',
    image_metadata: true,
  });
}

/**
 * Generate a Cloudinary upload signature for direct client upload.
 * The client uses this to upload directly to Cloudinary without going through our server.
 */
function generateUploadSignature(folder, uploadPreset = null) {
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    timestamp,
    folder,
    upload_preset: uploadPreset,
  };

  // Remove null/undefined params
  Object.keys(params).forEach(k => params[k] == null && delete params[k]);

  const signature = cloudinarySdk.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET
  );

  return {
    signature,
    timestamp,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder,
  };
}

module.exports = {
  mergeClips,
  getVideoInfo,
  generateUploadSignature,
};
