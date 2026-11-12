const fileInput = document.getElementById('fileInput');
const selectedFile = document.getElementById('selectedFile');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const maxFileSize = 5 * 1024 * 1024;

fileInput.addEventListener('change', () => {
	const file = fileInput.files[0];
	if (!file) return;

	fileName.textContent = file.name;
	fileSize.textContent = file.size < 1024 * 1024
		? `${(file.size / 1024).toFixed(1)} KB`
		: `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
	selectedFile.hidden = false;
	uploadBtn.disabled = file.size > maxFileSize;
	uploadStatus.textContent = file.size > maxFileSize
		? 'File must be 5 MiB or smaller.'
		: 'Ready to upload';
});

removeFileBtn.addEventListener('click', () => {
	fileInput.value = '';
	selectedFile.hidden = true;
	fileName.textContent = '';
	fileSize.textContent = '';
	uploadBtn.disabled = true;
	uploadStatus.textContent = 'No file selected';
	fileInput.focus();
});

uploadBtn.addEventListener('click', async () => {
	const file = fileInput.files[0];
	if (!file || file.size > maxFileSize) return;

	const formData = new FormData();
	// This name must match upload.single('upload_file') in the Express route.
	formData.append('upload_file', file);
	fileInput.disabled = true;
	removeFileBtn.disabled = true;
	uploadBtn.disabled = true;
	uploadBtn.textContent = 'Uploading...';
	uploadStatus.textContent = 'Uploading your file...';

	try {
		// Let Axios/the browser set the multipart boundary; do not set Content-Type.
		const response = await axios.put('/api/v1/upload', formData);
		fileInput.value = '';
		selectedFile.hidden = true;
		fileName.textContent = '';
		fileSize.textContent = '';
		uploadStatus.textContent = response.data.message;
	} catch (error) {
		uploadStatus.textContent = error.response?.data?.message
			?? 'Upload failed. Check your connection and try again.';
	} finally {
		fileInput.disabled = false;
		removeFileBtn.disabled = false;
		uploadBtn.disabled = !fileInput.files[0];
		uploadBtn.textContent = 'Upload file';
	}
});
