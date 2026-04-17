const cloudinary = require('cloudinary').v2;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

let configured = false;

function isConfigured() {
	return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

function ensureConfigured() {
	if (configured) return;
	if (!isConfigured()) {
		throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
	}

	cloudinary.config({
		cloud_name: CLOUDINARY_CLOUD_NAME,
		api_key: CLOUDINARY_API_KEY,
		api_secret: CLOUDINARY_API_SECRET,
		secure: true,
	});
	configured = true;
}

async function uploadVideo(filePath, options = {}) {
	ensureConfigured();
	return cloudinary.uploader.upload(filePath, {
		resource_type: 'video',
		...options,
	});
}

async function uploadVideoBuffer(fileBuffer, options = {}) {
	ensureConfigured();
	if (!fileBuffer) {
		throw new Error('Missing upload buffer');
	}

	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				resource_type: 'video',
				...options,
			},
			(error, result) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(result);
			}
		);

		stream.end(fileBuffer);
	});
}

async function uploadImage(filePath, options = {}) {
	ensureConfigured();
	return cloudinary.uploader.upload(filePath, {
		resource_type: 'image',
		...options,
	});
}

async function deleteAsset(publicId, resourceType = 'video') {
	ensureConfigured();
	if (!publicId) {
		return { result: 'not_found' };
	}
	return cloudinary.uploader.destroy(publicId, {
		resource_type: resourceType,
		invalidate: true,
	});
}

module.exports = {
	isConfigured,
	uploadVideo,
	uploadVideoBuffer,
	uploadImage,
	deleteAsset,
};
