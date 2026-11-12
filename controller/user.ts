import type { Request, Response } from 'express';
import { unlink } from 'node:fs/promises';
import { s3Client } from '../config/s3Client';

export const uploadFile = async (req: Request, res: Response) => {
	if (!req.file) {
		return res.status(400).json({ message: 'Please select a file to upload.' });
	}

	try {
		const bucketName = process.env.S3_BUCKET_NAME;
		if (!bucketName) throw new Error('S3_BUCKET_NAME must be configured');
		const prefix = process.env.S3_UPLOAD_PREFIX ?? 'uploads';
		const key = `${prefix}/${req.file.filename}`;
		await s3Client({ bucketName, key, filePath: req.file.path });
		res.status(200).json({ message: 'Upload successful', key });
	} catch (error) {
		console.error('S3 upload failed:', error);
		res.status(500).json({ message: 'Upload failed. Please try again.' });
	} finally {
		// Remove the temporary file after both successful and failed S3 attempts.
		try {
			await unlink(req.file.path);
		} catch (error) {
			console.error('Could not remove temporary upload:', error);
		}
	}
};
