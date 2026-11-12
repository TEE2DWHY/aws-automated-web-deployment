import { Router } from 'express';
import { uploadFile } from '../controller/user';
import { upload } from '../middleware/multer';
const router = Router();

router.put('/upload', upload.single('upload_file'), uploadFile);

export default router;
