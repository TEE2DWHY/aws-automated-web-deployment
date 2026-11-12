import multer from 'multer';
import type { ErrorRequestHandler } from 'express';

// Multer runs before the controller, so its errors need separate handling.
export const uploadErrors: ErrorRequestHandler = (error, req, res, next) => {
	if (res.headersSent) return next(error);

	if (error instanceof multer.MulterError) {
		if (error.code === 'LIMIT_FILE_SIZE') {
			return res.status(413).json({ message: 'File must be 5 MiB or smaller.' });
		}
		return res.status(400).json({
			message: 'Send one file using the upload_file field, with no additional fields.',
		});
	}

	console.error('Request failed:', error);
	res.status(500).json({ message: 'Unable to process the request. Please try again.' });
};
