import { Router } from "express";
import { uploadFile } from "../controller/user";
const router = Router()

router.put("/upload", uploadFile)

export default router

