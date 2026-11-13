import { S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, test } from 'vitest';

// Isolate temporary uploads and replace S3's network call, not multipart parsing.
const previousDirectory = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'app-upload-test-'));
const previousBucket = process.env.S3_BUCKET_NAME;
const previousPrefix = process.env.S3_UPLOAD_PREFIX;
process.chdir(directory);
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.S3_UPLOAD_PREFIX = 'uploads';
let failS3 = false;
const commands: any[] = [];
const originalSend = S3Client.prototype.send;
S3Client.prototype.send = (async (command: any) => {
	commands.push(command.input);
	if (failS3) throw new Error('Simulated S3 failure');
	return {};
}) as typeof originalSend;

const { default: routes } = await import('../routes/index');
const { uploadErrors } = await import('../middleware/uploadErrors');
const app = express();
app.use(routes);
app.use(uploadErrors);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
	server.once('listening', resolve);
	server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/api/v1/upload`;

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	S3Client.prototype.send = originalSend;
	process.chdir(previousDirectory);
	if (previousBucket === undefined) delete process.env.S3_BUCKET_NAME;
	else process.env.S3_BUCKET_NAME = previousBucket;
	if (previousPrefix === undefined) delete process.env.S3_UPLOAD_PREFIX;
	else process.env.S3_UPLOAD_PREFIX = previousPrefix;
	await rm(directory, { recursive: true, force: true });
});

function fileForm(field = 'upload_file', size = 12) {
	const form = new FormData();
	form.append(field, new Blob([Buffer.alloc(size, 65)]), 'example.txt');
	return form;
}

async function assertNoTemporaryFiles() {
	// The response may arrive before the controller's finally block finishes.
	for (let attempt = 0; attempt < 50; attempt++) {
		if ((await readdir(join(directory, 'uploads'))).length === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	assert.deepEqual(await readdir(join(directory, 'uploads')), []);
}

test('missing file returns 400 without contacting S3', async () => {
	const before = commands.length;
	const response = await fetch(url, { method: 'PUT' });
	assert.equal(response.status, 400);
	assert.match((await response.json()).message, /select a file/i);
	assert.equal(commands.length, before);
});

test('multipart uploads reach S3 with matching bytes and unique keys, then are removed', async () => {
	const keys: string[] = [];
	for (let i = 0; i < 2; i++) {
		const response = await fetch(url, { method: 'PUT', body: fileForm() });
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.match(body.key, /^uploads\/[a-f0-9]{32}$/);
		keys.push(body.key);
		assert.equal(commands.at(-1).Bucket, 'test-bucket');
		assert.equal(commands.at(-1).Body.toString(), 'AAAAAAAAAAAA');
		await assertNoTemporaryFiles();
	}
	assert.notEqual(keys[0], keys[1]);
});

test('S3 failure returns a safe error and removes the temporary file', async () => {
	failS3 = true;
	try {
		const response = await fetch(url, { method: 'PUT', body: fileForm() });
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), {
			message: 'Upload failed. Please try again.',
		});
		await assertNoTemporaryFiles();
	} finally {
		failS3 = false;
	}
});

test('oversized file returns 413 without contacting S3 or retaining a file', async () => {
	const before = commands.length;
	const response = await fetch(url, {
		method: 'PUT',
		body: fileForm('upload_file', 5 * 1024 * 1024 + 1),
	});
	assert.equal(response.status, 413);
	assert.match((await response.json()).message, /5 MiB/);
	assert.equal(commands.length, before);
	await assertNoTemporaryFiles();
});

test('unexpected file field returns a JSON 400 response', async () => {
	const before = commands.length;
	const response = await fetch(url, {
		method: 'PUT',
		body: fileForm('wrong_field'),
	});
	assert.equal(response.status, 400);
	assert.match((await response.json()).message, /upload_file/);
	assert.equal(commands.length, before);
	await assertNoTemporaryFiles();
});

test('multiple files are rejected and partial uploads are removed', async () => {
	const before = commands.length;
	const form = fileForm();
	form.append('upload_file', new Blob(['second file']), 'second.txt');
	const response = await fetch(url, { method: 'PUT', body: form });
	assert.equal(response.status, 400);
	assert.equal(commands.length, before);
	await assertNoTemporaryFiles();
});
