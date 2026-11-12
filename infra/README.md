# Provision the application infrastructure

`setup.yaml` creates a dedicated VPC, public subnet, internet gateway and routing, EC2 instance, security group, private encrypted S3 bucket, EC2 role, and instance profile.

**User Data has been removed for this learning stage.** CloudFormation does not install Node.js, download your application, install dependencies, configure its environment, or start a service. A successful stack creates the infrastructure only. AWS deployment has not yet been verified.

## Deploy

Use an authenticated AWS CLI profile with permission to provision the resources and pass the EC2 role. Run these commands from the project directory, replacing the example values:

```bash
export AWS_PROFILE=YOUR_PROFILE
export AWS_REGION=eu-west-2
export STACK_NAME=automated-web-app
export CLIENT_CIDR=YOUR_PUBLIC_IPV4/32
aws sts get-caller-identity

aws cloudformation validate-template --template-body file://infra/setup.yaml

aws cloudformation deploy \
  --template-file infra/setup.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides AllowedClientCidr="$CLIENT_CIDR" \
  --tags Project=AutomatedWebDeployment Environment=portfolio

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs' --output table
```

No existing VPC or subnet selection is required. The subnet assigns a public IPv4 address, and its route table sends internet traffic through the attached internet gateway. Application access is restricted to your supplied CIDR. Port 22 is not opened.

EC2, EBS, public IPv4, S3, and data transfer may incur charges. This is a single-instance HTTP demonstration, with no load balancer, application authentication, or high availability.

## Install the application manually

Use the EC2 instance ID from the stack outputs to connect through the AWS console's Session Manager. Your operator identity needs permission to start sessions. The instance profile includes the SSM managed policy; Session Manager also requires a running SSM agent and working internet connectivity.

Work through these steps on EC2:

1. Install Node.js 22 and npm using Amazon Linux's package manager.
2. Download the application from a pushed GitHub commit and enter the directory containing `package.json`.
3. Install runtime dependencies with `npm ci --omit=dev`, using Node.js 22's npm executable (`npm-22`). The project includes `tsx` as a runtime dependency.
4. Set `PORT` to the stack's `AppPort`, `AWS_REGION` to the deployment region, `S3_BUCKET_NAME` to the bucket output, and `S3_UPLOAD_PREFIX` to the stack's `UploadPrefix` (default `uploads`). No AWS access keys are required: the SDK uses the EC2 role.
5. Start the app with `npm start`. For persistence after logout and reboot, configure a systemd service as a separate learning step. The template does not create that service.

The template no longer needs repository or source-revision parameters because it does not download code. Record the commit you install yourself.

## Verify

After installing and starting the app, use the application URL from the outputs:

```bash
curl --fail http://YOUR_INSTANCE_PUBLIC_IP:8000/health
curl --fail -X PUT http://YOUR_INSTANCE_PUBLIC_IP:8000/api/v1/upload
```

Use the configured port if it differs from 8000. Expected responses are `Server is ok.` and `{"message":"Upload successful"}`. These endpoints will not respond before manual application startup.

The upload endpoint currently sends the bundled sample image, not a browser-supplied file. It stores that image at `uploads/test-key-123` with the default prefix. Run the app from the project directory because the sample file path is relative.

The EC2 role only permits `s3:PutObject` under the configured prefix. It cannot read, list, or delete objects. The bucket blocks public access and denies requests without HTTPS. Using a separately authorized operator identity, confirm the object exists:

```bash
aws s3api head-object --bucket YOUR_STACK_BUCKET --key uploads/test-key-123
```

For permission evidence, install the AWS CLI on EC2 if necessary and run these inside its Session Manager session. Use your actual region, bucket name, and prefix:

```bash
aws sts get-caller-identity --region eu-west-2
printf 'instance role permission test\n' > /tmp/role-test.txt
aws s3api put-object --region eu-west-2 --bucket YOUR_STACK_BUCKET \
  --key uploads/role-test.txt --body /tmp/role-test.txt
aws s3api put-object --region eu-west-2 --bucket YOUR_STACK_BUCKET \
  --key outside-prefix/role-test.txt --body /tmp/role-test.txt
```

The first write should succeed; the second should return `AccessDenied`. Do not configure static credentials on EC2. Verify reboot recovery only after manually configuring a persistent service.

## Updates and troubleshooting

Rerun the deploy command with `InstanceType=t3.small` added to the parameter overrides to demonstrate an infrastructure update. This can stop and start EC2, interrupt service, and change its public IP. Retrieve outputs again afterward. Changes to the template do not release application code; application releases are manual.

Inspect provisioning failures with:

```bash
aws cloudformation describe-stack-events --stack-name "$STACK_NAME" --output table
```

For application problems, inspect the process you started, its environment, and its terminal output. If you manually create a systemd service, inspect that service's journal. No `webapp` service or bootstrap log is created by the template.

## Cleanup

These commands permanently remove the demo's uploaded files and stack. Confirm the bucket and stack names first. Use an operator identity with deletion permission; the EC2 application role cannot delete objects.

```bash
aws s3 rm s3://YOUR_STACK_BUCKET --recursive
aws cloudformation delete-stack --stack-name "$STACK_NAME"
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"
```

The bucket must be empty for deletion to succeed. Versioning is omitted; if you enable it later, also delete versions and delete markers. If an update replaces the bucket, the old bucket is retained and requires separate cleanup. Stack deletion removes its dedicated network and EC2 root disk, including manually installed application files.
