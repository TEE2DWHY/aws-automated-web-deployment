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

## 2. Set up the application on EC2

Run these commands in the **EC2 Session Manager terminal**, not on your laptop.

### Connect and update the code

In EC2, select your instance → **Connect → Session Manager → Connect**. Then:

```bash
cd /opt/webapp
ls package.json
sudo git pull --ff-only
```

User Data downloads the repository on first boot. `git pull --ff-only` gets changes pushed since then and stops if the histories have diverged. If `/opt/webapp` is missing, check `/var/log/cloud-init-output.log`; the first-boot download may still be running or may have failed.

### Install Node.js and dependencies

```bash
sudo dnf install -y nodejs22 nodejs22-npm
node-22 --version
npm-22 --version

cd /opt/webapp
sudo npm-22 ci --omit=dev
```

`sudo` is needed for installation because the application directory was created by root. Start the app as your regular session user later.

### Create the environment file

```bash
sudo nano /opt/webapp/.env
```

Enter these values, replacing the region and bucket name with your actual stack details:

```dotenv
PORT=8000
AWS_REGION=YOUR_BUCKET_REGION
S3_BUCKET_NAME=YOUR_STACK_BUCKET_NAME
S3_UPLOAD_PREFIX=uploads
```

Use the stack's `AppPort` and `UploadPrefix` if you changed their defaults. Find `BucketName` in CloudFormation **Outputs**. The region must match the bucket's region.

Save with **Ctrl+O**, press **Enter**, then exit with **Ctrl+X**. No AWS access keys or `local-dev` profile are needed on EC2; the SDK uses the attached role.

### Give the app permission to save temporary uploads

```bash
sudo mkdir -p /opt/webapp/uploads
sudo chown "$(id -un):$(id -gn)" /opt/webapp/uploads
sudo chmod 700 /opt/webapp/uploads

cd /opt/webapp
touch uploads/write-test
rm uploads/write-test
```

`chown` gives your current user ownership of the upload directory. `chmod 700` allows only that owner to access it. The write test checks that Multer can create and remove temporary files. Use this same user to run the app.

### Start the app

```bash
cd /opt/webapp
npm-22 start
```

Expect `Server is running on port: 8000`. Leave this terminal running while testing. Restart the app after changing `.env` or updating the code. A systemd service is still needed to keep it running after disconnecting and to start it after a reboot.

### Common EC2 errors

- **`npm-22: command not found`:** install `nodejs22` and `nodejs22-npm` first.
- **Missing `/usr/bin/package.json`:** run `cd /opt/webapp` before npm commands.
- **Port is `undefined`:** confirm `/opt/webapp/.env` exists and contains `PORT=8000`.
- **`EACCES` for `uploads/`:** repeat the directory ownership and write-test commands above as the user running the app.
- **S3 `PermanentRedirect`:** correct the bucket region in `.env` and restart.

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
