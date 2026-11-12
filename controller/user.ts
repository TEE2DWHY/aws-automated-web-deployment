import type { Request, Response } from 'express';
import { s3Client } from '../config/s3Client';

export const uploadFile = async (req: Request, res: Response) => {
	try {
		const bucketName = process.env.S3_BUCKET_NAME;
		if (!bucketName) throw new Error('S3_BUCKET_NAME must be configured');
		const prefix = process.env.S3_UPLOAD_PREFIX ?? 'uploads';
		const response = await s3Client({
			bucketName,
			key: `${prefix}/test-key-123`,
			filePath: './public/assets/img/hiyaaa.webp',
		});
		console.log(response);
		res.status(200).json({ message: 'Upload successful' });
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: `${error}` });
	}
};
