# Deploy the application environment

`setup.yaml` provisions a dedicated VPC, public subnet and route, EC2 instance, security group, encrypted private S3 bucket, EC2 role, and instance profile. Nothing has been deployed or verified in AWS yet.

## Design

- Amazon Linux 2023 and Node.js 22, with an encrypted gp3 root volume and IMDSv2 required.
- No SSH port or key pair. Administration uses AWS Systems Manager Session Manager and an operator identity authorized to start sessions.
- Application access is limited to the IPv4 CIDR supplied at deployment. Use your public IPv4 address followed by `/32`.
- Bucket ownership is enforced, public access is blocked, and a bucket policy denies non-TLS S3 requests.
- The app role can only `PutObject` under the configured upload prefix. It cannot list the bucket, read objects, delete objects, or write elsewhere. The SSM managed policy supports Session Manager administration.
- Bootstrap downloads a specified commit from the public GitHub repository, installs locked runtime dependencies with `npm ci --omit=dev`, and starts TypeScript through `tsx` under an unprivileged systemd service. No credentials are embedded.
- CloudFormation does not wait for application startup. A completed stack can still have a failed setup script or service. Allow time for User Data to finish, then verify `/health` and the upload endpoint yourself.
- systemd restarts the service after a crash and starts it after an instance reboot. Source is not fetched again on each reboot.

This is a single-instance learning environment with HTTP access. It has no load balancer, HTTPS application endpoint, application authentication, or high availability. EC2, EBS, public IPv4, S3, and data transfer may incur charges. The CIDR restriction matters because the sample upload endpoint is unauthenticated.

## Before deploying

1. Configure an AWS CLI profile with permission to create the resources in the template, including IAM roles, instance profiles, and role passing. The deployment identity is separate from the restricted application role.
2. Commit and push these template, application, manifest, and lockfile changes. The older initial commit does not contain the deployment configuration and runtime dependency required by bootstrap.
3. Copy the full 40-character SHA of that pushed commit. The repository must be public, and `package.json` must be at its root.
4. Obtain your public IPv4 address, add `/32`, and keep the same allowed network while testing.

Run commands below from the directory containing the project's `package.json`. Replace example values before running them:

```bash
export AWS_PROFILE=YOUR_PROFILE
export AWS_REGION=eu-west-2
export STACK_NAME=automated-web-app
export SOURCE_REVISION=YOUR_PUSHED_40_CHARACTER_COMMIT_SHA
export CLIENT_CIDR=YOUR_PUBLIC_IPV4/32
aws sts get-caller-identity
```

For an SSO profile, log in with `aws sso login --profile YOUR_PROFILE` first.

## Validate and deploy

Optional local schema validation, if `cfn-lint` is installed:

```bash
cfn-lint infra/setup.yaml
```

AWS template validation (requires authentication; this alone does not guarantee deployment success):

```bash
aws cloudformation validate-template --template-body file://infra/setup.yaml
```

Deploy the entire environment with one deployment command:

```bash
aws cloudformation deploy \
  --template-file infra/setup.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    SourceRevision="$SOURCE_REVISION" \
    AllowedClientCidr="$CLIENT_CIDR" \
  --tags Project=AutomatedWebDeployment Environment=portfolio
```

CloudFormation generates the bucket name; there is no globally fixed name to reserve. Bootstrap injects that name, the stack region, port, and upload prefix through `/etc/webapp.env`.

Inspect outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' --output table

APP_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ApplicationUrl'].OutputValue | [0]" --output text)
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" --output text)
INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" --output text)
```

## Verify the app and role

From your permitted network:

```bash
curl --fail "$APP_URL/health"
curl --fail -X PUT "$APP_URL/api/v1/upload"
```

The first request may fail while dependencies are still being installed. Retry after setup finishes; if it continues to fail, use the troubleshooting commands below. Expected results are `Server is ok.` and `{"message":"Upload successful"}`. The upload stores the bundled sample image at `uploads/test-key-123` with the default prefix. Repeating it overwrites the same object.

Using your operator identity, verify the object exists:

```bash
aws s3api head-object --bucket "$BUCKET_NAME" --key uploads/test-key-123
```

Connect to EC2 through the Session Manager console, or use the CLI with its Session Manager plugin installed:

```bash
aws ssm start-session --target "$INSTANCE_ID"
```

Inside that EC2 session, run the following commands. Replace the bucket name with the stack output. Do not configure access keys or a local AWS profile on EC2:

```bash
aws sts get-caller-identity --region eu-west-2
printf 'instance role permission test\n' > /tmp/role-test.txt
aws s3api put-object --region eu-west-2 --bucket YOUR_STACK_BUCKET \
  --key uploads/role-test.txt --body /tmp/role-test.txt
aws s3api put-object --region eu-west-2 --bucket YOUR_STACK_BUCKET \
  --key outside-prefix/role-test.txt --body /tmp/role-test.txt
```

Use the actual stack region if it differs. Identity output should identify the assumed EC2 role. The first write should succeed; the second should return `AccessDenied`. Capture both results as permission evidence. Listing or downloading from this bucket as the instance role is also intentionally unauthorized.

## Update infrastructure

For a controlled update, rerun the deployment command with the original parameters plus `InstanceType=t3.small`. This can stop and start the instance, interrupt service, and change its public IP and DNS name. Retrieve outputs again afterward. You can change back to `t3.micro` using the same workflow.

**Application release boundary:** User Data runs on first boot. Changing `SourceRevision`, `SourceRepository`, port, prefix, or other bootstrap content does not automatically reinstall or reconfigure an existing instance. The revision output reports the configured parameter, not an independently verified running revision. For a new application release in this version, deploy a new stack name with the new commit, verify it, then clean up the old stack. Automated replacement or a separate release pipeline remains future work.

## Troubleshooting

Inspect stack events if infrastructure provisioning fails:

```bash
aws cloudformation describe-stack-events --stack-name "$STACK_NAME" --output table
```

On EC2 through Session Manager:

```bash
sudo journalctl -u webapp --no-pager -n 100
sudo tail -n 100 /var/log/cloud-init-output.log
sudo systemctl status webapp
```

A rollback may terminate an instance before you can connect. Bootstrap can fail if the commit is unavailable, the repository is private, `tsx` is missing from runtime dependencies, package installation fails, or the instance cannot reach external services. A stack that reaches `ROLLBACK_COMPLETE` must generally be deleted before recreating it under the same name.

The health endpoint is a liveness check. S3 authentication and authorization are verified separately by the upload and permission checks.

## Clean up

These commands permanently remove this demo's uploaded objects and stack resources. Confirm the stack and bucket values before executing. Run using your operator identity; the application role intentionally cannot delete objects.

```bash
aws s3 rm "s3://$BUCKET_NAME" --recursive
aws cloudformation delete-stack --stack-name "$STACK_NAME"
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"
```

Bucket versioning is omitted for straightforward cleanup. If you later enable versioning, delete all versions and delete markers before deleting the stack. CloudFormation will not delete a nonempty bucket. Bucket replacement is configured to retain the old bucket to avoid accidental data loss; a future change that replaces the bucket therefore needs separate old-bucket cleanup.

## Evidence to collect

Record the deployed source commit, successful stack outputs, HTTP responses, operator verification of the uploaded object, EC2 assumed-role identity, permitted and denied writes, a CloudFormation update, reboot recovery, and completed deletion. Redact account identifiers and sensitive details in public screenshots. Do not claim a successful deployment until those checks have actually run.

## Understanding the five startup steps

`UserData` contains a Bash script. CloudFormation replaces `${...}` placeholders through `!Sub` and Base64-encodes the script before passing it to EC2.

1. **Install Node.js:** `dnf` installs Node.js 22, npm, and the AWS CLI for later permission checks. `set -e` stops the script when a command fails.
2. **Download the application:** `mkdir` creates `/opt/webapp`, `curl` downloads the selected commit as an archive, and `tar` extracts it. `--strip-components=1` removes the archive's outer directory so `package.json` lands directly in `/opt/webapp`.
3. **Install dependencies:** `npm-22 ci --omit=dev` installs the runtime dependencies specified by the lockfile. `tsx` must be a runtime dependency because this project executes TypeScript directly.
4. **Configure the application:** `cat` writes the lines between `APPENV` markers into `/etc/webapp.env`. CloudFormation supplies the bucket name, region, port, and prefix. No AWS access keys go into this file. `chmod 600` limits file access to root; systemd reads the file and passes the values into the service's environment.
5. **Start through systemd:** `useradd` creates a separate Linux account for the app. The text between `SERVICE` markers defines its working directory, environment file, startup command, and restart behaviour. `daemon-reload` loads the definition; `enable --now` starts it immediately and enables startup after reboot.

The former health-check signaling function, error trap, CloudFormation signaling permission, and `CreationPolicy` have been removed together. Logs remain available through `/var/log/cloud-init-output.log` and `journalctl -u webapp`.
