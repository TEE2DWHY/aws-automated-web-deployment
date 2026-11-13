# AWS Automated Web Deployment

A learning project that uses CloudFormation to create AWS infrastructure for a TypeScript file-upload application. The goal is to make the environment repeatable and give EC2 access to S3 without storing AWS credentials in the code.

##` Architecture Diagram

![CloudFormation Setup](./cloud-formation.png)

## How it works

```text
Browser → Express app on EC2 → Private S3 bucket
```

- The browser lets you select and upload one file up to 5 MiB.
- Express and Multer receive the file, then the AWS SDK uploads it to S3.
- S3 object names use Multer-generated filenames under the configured prefix.
- Temporary files are removed after the upload attempt.
- EC2 uses an IAM role with upload permission for that bucket prefix.

Built with TypeScript, Node.js, Express, Multer, Axios, and AWS CloudFormation.

## Current progress

The application and infrastructure template are implemented. Real AWS deployment and successful uploads still need to be verified.

CloudFormation creates the network, EC2, S3, and IAM resources. User Data installs Git and downloads the repository. **Installing Node.js, configuring the application, and starting it are still manual.** Full application startup automation is a later step.

## Run locally

Use Node.js 22. From the project directory:

```bash
npm install
cp .env.example .env
```

Edit `.env` with your bucket details:

```dotenv
PORT=8000
AWS_REGION=eu-west-2
S3_BUCKET_NAME=your-bucket-name
S3_UPLOAD_PREFIX=uploads
```

The bucket must already exist. Configure and sign in to an AWS profile with permission to upload to it. For a named profile:

```bash
AWS_PROFILE=your-profile npm run dev
```

Open **http://localhost:8000**, choose a file, and click **Upload file**. Confirm the object appears in S3. Your local AWS credentials are separate from the role attached to EC2.

## Endpoints

| Method | Path             | Purpose                                               |
| ------ | ---------------- | ----------------------------------------------------- |
| GET    | `/`              | Upload page                                           |
| GET    | `/health`        | Check that the server responds                        |
| PUT    | `/api/v1/upload` | Upload a file using the `upload_file` multipart field |

## Deploy to AWS

Follow the [infrastructure guide](infra/README.md) to create the stack and set up the application on EC2.

## Tests

```bash
npm test
```

Vitest runs the upload and browser logic tests. Use `npm run test:watch` during development. Tests use mocked S3 calls. They do not verify real AWS permissions or deployment.

## Next steps

- Verify browser uploads on EC2 and confirm the objects in S3.
- Demonstrate permitted and denied operations using the EC2 role.
- Configure systemd, then automate application installation and startup.
- Demonstrate a CloudFormation update and successful stack cleanup.
- Add screenshots and lessons learned.

This is a learning environment. Authentication, downloads, and an HTTPS application endpoint are not implemented yet.
