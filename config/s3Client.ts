import { PutObjectCommand, S3Client, S3ClientConfig, } from "@aws-sdk/client-s3"
import { readFile } from "node:fs/promises"

type S3Value ={
    bucketName: string,
    key: string,
    filePath: string
}

const config: S3ClientConfig  = {
    region: process.env.AWS_REGION ?? "eu-west-2",
}
const client = new S3Client(config)

export const s3Client = async({bucketName, key, filePath} : S3Value)=>{
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: await readFile(filePath)
    })
    try{
      const response =  await client.send(command)
      console.log(response)
      return response;
    }
    catch(error){
       throw new Error(error as any)
    }
}
