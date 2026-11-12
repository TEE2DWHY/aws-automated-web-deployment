# AWS Infrastructure

`setup.yaml` creates:

- A VPC, public subnet, internet gateway, and routing.
- A private, encrypted S3 bucket.
- An EC2 role and instance profile with upload permission under the chosen S3 prefix.
- A security group that allows your public IP to reach the application port.
- An Amazon Linux 2023 EC2 instance.

On first boot, User Data installs Git and downloads the public repository into `/opt/webapp`. **It does not install Node.js or start the application.**

## 1. Create the stack

1. Push your application changes to GitHub so EC2 can download them.
2. Open CloudFormation in your chosen AWS region and choose **Create stack**.
3. Upload `setup.yaml` and name the stack, for example `automated-web-app`.
4. Keep the default parameters unless you need to change them. For `AllowedClientCidr`, get your public IPv4:

   ```bash
   curl -4 https://checkip.amazonaws.com
   ```

   Add `/32` to the returned address and enter it as the parameter value.

5. Keep rollback and validation enabled. Acknowledge that CloudFormation may create IAM resources.
6. Submit the stack and watch **Events** until it reaches `CREATE_COMPLETE`.

The stack creates its own network; you do not need to select a VPC or subnet. Running these AWS resources may incur charges.

## 2. Set up the application

1. Find the instance in EC2 and connect through **Session Manager**. Your AWS identity needs permission to start a session.
2. Check that the repository exists at `/opt/webapp`. User Data may still be downloading it when stack creation finishes.
3. Install Node.js 22 and npm, then install the application's dependencies with `npm-22 ci --omit=dev` from `/opt/webapp`.
4. Configure the application environment:

   ```dotenv
   PORT=8000
   AWS_REGION=eu-west-2
   S3_BUCKET_NAME=your-stack-bucket-name
   S3_UPLOAD_PREFIX=uploads
   ```

   Use your actual stack region, port, prefix, and the `BucketName` from **Outputs**. The app supports a `.env` file in its working directory. Do not add AWS access keys; EC2 uses its role.

5. Start the app with `npm-22 start` from `/opt/webapp`.

The app runs in the foreground for now. A systemd service is needed later to keep it running after disconnecting and to start it after a reboot.

## 3. Check it works

- Open `ApplicationUrl` from the stack's **Outputs**, select a small file, and upload it.
- Check `HealthUrl` for the server response.
- Confirm the uploaded object in the S3 console using your operator identity.
- Verify that the EC2 role can upload inside the configured prefix but cannot upload outside it.

Stack completion does not confirm application readiness. Your public IP must match `AllowedClientCidr`; update the parameter if your address changes.

## 4. Update or troubleshoot

Use **Update stack** to apply template or parameter changes. An instance-size update can restart EC2 and change its public IP, so retrieve the outputs again afterward.

Application code updates remain manual. User Data downloads code on first boot, not on every restart.

For infrastructure failures, check CloudFormation **Events**. For repository download errors, inspect this file on EC2:

```bash
sudo tail -n 100 /var/log/cloud-init-output.log
```

For application errors, check the terminal where you started the server.

## 5. Clean up

1. Delete the uploaded objects from the stack's S3 bucket.
2. Choose **Delete** for the stack in CloudFormation.
3. Check that deletion finishes successfully.

All resources have `DeletionPolicy: Delete`. The bucket must be empty before CloudFormation can delete it. The EC2 root disk and application files are deleted with the instance.

If an update replaces the S3 bucket, `UpdateReplacePolicy: Retain` keeps the old bucket. That old bucket needs separate cleanup.
