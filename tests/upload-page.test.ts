import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/js/upload.js', import.meta.url), 'utf8');

function page(put: (...args: any[]) => Promise<any>) {
	const elements: Record<string, any> = {};
	for (const id of ['fileInput', 'selectedFile', 'fileName', 'fileSize', 'removeFileBtn', 'uploadBtn', 'uploadStatus']) {
		elements[id] = {
			files: [], disabled: false, hidden: true, textContent: '',
			listeners: {}, addEventListener(event: string, fn: Function) { this.listeners[event] = fn; },
			focus() {},
		};
	}
	Object.defineProperty(elements.fileInput, 'value', {
		set(value) { if (value === '') elements.fileInput.files = []; },
	});
	vm.runInNewContext(source, {
		document: { getElementById: (id: string) => elements[id] },
		axios: { put }, FormData,
	});
	return elements;
}

test('selected file is sent through Axios under upload_file and controls lock during upload', async () => {
	const file = new Blob(['selected file']);
	Object.defineProperty(file, 'name', { value: 'example.txt' });
	let finish: (value: any) => void = () => {};
	const elements = page(async (url, data) => {
		assert.equal(url, '/api/v1/upload');
		assert.equal(await data.get('upload_file').text(), 'selected file');
		return new Promise((resolve) => { finish = resolve; });
	});
	elements.fileInput.files = [file];
	elements.fileInput.listeners.change();
	assert.equal(elements.uploadBtn.disabled, false);
	const uploading = elements.uploadBtn.listeners.click();
	assert.equal(elements.uploadBtn.disabled, true);
	assert.equal(elements.fileInput.disabled, true);
	// Let the mocked Axios call finish reading the FormData.
	await new Promise((resolve) => setImmediate(resolve));
	finish({ data: { message: 'Upload successful' } });
	await uploading;
	assert.equal(elements.uploadStatus.textContent, 'Upload successful');
	assert.equal(elements.fileInput.files.length, 0);
	assert.equal(elements.uploadBtn.disabled, true);
	assert.equal(elements.fileInput.disabled, false);
});

test('API error is displayed and file remains selected for retry', async () => {
	const elements = page(async () => { throw { response: { data: { message: 'Upload rejected' } } }; });
	elements.fileInput.files = [new Blob(['file'])];
	await elements.uploadBtn.listeners.click();
	assert.equal(elements.uploadStatus.textContent, 'Upload rejected');
	assert.equal(elements.uploadBtn.disabled, false);
	assert.equal(elements.removeFileBtn.disabled, false);
});

test('oversized selection disables upload before making an API call', async () => {
	let calls = 0;
	const elements = page(async () => { calls++; });
	elements.fileInput.files = [{ name: 'large.bin', size: 5 * 1024 * 1024 + 1 }];
	elements.fileInput.listeners.change();
	await elements.uploadBtn.listeners.click();
	assert.equal(elements.uploadBtn.disabled, true);
	assert.equal(calls, 0);
});
