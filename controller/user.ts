import { Request, Response } from "express";
import { s3Client } from "../config/s3Client";

export const uploadFile = async(req: Request, res: Response)=>{
    try{
        const response = await s3Client({bucketName:"app-demo-bucket", key:"test-key-123", filePath:"./public/assets/img/hiyaaa.webp"} ) 
        console.log(response)
        res.status(200).json({message: "Upload successful"})
    }
    catch(error){
        console.log(error)
        res.status(500).json({message: `${error}`})
    }
}
