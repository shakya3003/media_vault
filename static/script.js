let currentMode = 'encrypt';
const form = document.getElementById('crypto-form');
const fileInput = document.getElementById('file');
const fileNameDisplay = document.getElementById('file-name');
const dropZone = document.getElementById('drop-zone');
const submitBtn = document.getElementById('submit-btn');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

const cloudToggleGroup = document.getElementById('cloud-toggle-group');
const cloudToggle = document.getElementById('cloud-toggle');

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

function setMode(mode) {
    currentMode = mode;
    document.getElementById('tab-encrypt').classList.remove('active');
    document.getElementById('tab-decrypt').classList.remove('active');
    document.getElementById(`tab-${mode}`).classList.add('active');
    
    document.getElementById('password').value = '';
    fileInput.value = '';
    fileNameDisplay.innerHTML = 'Drag & Drop your media file here<br>or click to browse';
    
    if (mode === 'encrypt') {
        submitBtn.textContent = 'Encrypt File Locally';
        if(cloudToggleGroup) cloudToggleGroup.style.display = 'block';
    } else {
        submitBtn.textContent = 'Decrypt File Locally';
        if(cloudToggleGroup) cloudToggleGroup.style.display = 'none';
    }
}

// Handle Drag and Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        fileNameDisplay.innerHTML = `<strong>Selected:</strong><br>${files[0].name}`;
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        fileNameDisplay.innerHTML = `<strong>Selected:</strong><br>${e.target.files[0].name}`;
    }
});

function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressText.innerText = `${Math.round(percent)}%`;
}

// Crypto Utils
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// Extract and decrypt original filename from header
async function getDecryptedFilename(file, password) {
    if (file.size < 30) throw new Error("File is too small to be a valid vault file.");
    
    const salt = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const key = await deriveKey(password, salt);
    
    const iv = new Uint8Array(await file.slice(16, 28).arrayBuffer());
    const lenDataView = new DataView(await file.slice(28, 30).arrayBuffer());
    const encNameLen = lenDataView.getUint16(0, false);
    
    if (file.size < 30 + encNameLen) throw new Error("Corrupted file header.");
    
    const encNameBuffer = await file.slice(30, 30 + encNameLen).arrayBuffer();
    
    try {
        const decryptedNameBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encNameBuffer
        );
        const decoder = new TextDecoder();
        return {
            filename: decoder.decode(decryptedNameBuffer),
            dataOffset: 30 + encNameLen,
            key: key
        };
    } catch (e) {
        throw new Error("Incorrect password or corrupted file.");
    }
}

// Handle Cloud Stream
class CloudStream {
    constructor(filename) {
        this.chunks = [];
        this.filename = filename;
    }
    async write(data) {
        this.chunks.push(data);
    }
    async close() {
        progressText.innerText = "Encryption complete. Uploading to secure cloud...";
        const blob = new Blob(this.chunks, { type: "application/octet-stream" });
        const formData = new FormData();
        formData.append("file", blob, this.filename);
        
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
            const errJson = await res.json().catch(()=>({}));
            throw new Error(errJson.detail || "Cloud upload failed. Are your API keys set up in .env?");
        }
        const json = await res.json();
        
        const shareLink = `${window.location.origin}${json.link}`;
        progressText.innerHTML = `Success! Share this secure link:<br><a href="${shareLink}" target="_blank" style="color:#60a5fa; font-weight:bold; word-break: break-all;">${shareLink}</a>`;
        window.keepStatusVisible = true;
    }
}

// E2E Encrypt/Decrypt processing
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (fileInput.files.length === 0) return;
    
    const file = fileInput.files[0];
    const password = document.getElementById('password').value;
    
    if (password.length < 8) {
        alert("For your security, the password must be at least 8 characters long.");
        return;
    }
    
    statusDiv.classList.remove('hidden');
    updateProgress(0);
    submitBtn.disabled = true;
    window.keepStatusVisible = false;

    try {
        let outFileName;
        let dataOffset = 0;
        let preDerivedKey = null;
        
        if (currentMode === 'encrypt') {
            outFileName = `${file.name}.enc`;
        } else {
            if (!file.name.endsWith('.enc')) {
                throw new Error("Please select a .enc file to decrypt.");
            }
            // Decrypt the header first to get the true filename
            progressText.innerText = "Verifying password and reading header...";
            const meta = await getDecryptedFilename(file, password);
            outFileName = meta.filename;
            dataOffset = meta.dataOffset;
            preDerivedKey = meta.key;
        }

        const isCloudUpload = currentMode === 'encrypt' && cloudToggle && cloudToggle.checked;
        let outStream;
        
        if (isCloudUpload) {
            outStream = new CloudStream(outFileName);
        } else if ('showSaveFilePicker' in window) {
            const handle = await window.showSaveFilePicker({ suggestedName: outFileName });
            const writable = await handle.createWritable();
            outStream = writable;
        } else {
            // Fallback for Safari/Firefox
            console.warn("File System Access API not supported. Falling back to memory blob.");
            class MemoryStream {
                constructor(filename) {
                    this.chunks = [];
                    this.filename = filename;
                }
                async write(data) {
                    this.chunks.push(data);
                }
                async close() {
                    const blob = new Blob(this.chunks, { type: "application/octet-stream" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = this.filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 100);
                }
            }
            outStream = new MemoryStream(outFileName);
        }

        if (currentMode === 'encrypt') {
            await encryptFile(file, password, outStream);
        } else {
            await decryptFile(file, preDerivedKey, dataOffset, outStream);
        }
        
        await outStream.close();
        if (!window.keepStatusVisible) {
            updateProgress(100);
            progressText.innerText = "Complete! File saved successfully.";
        }
        
    } catch (err) {
        console.error(err);
        progressText.innerText = `Error: ${err.message}`;
        window.keepStatusVisible = true;
    } finally {
        submitBtn.disabled = false;
        setTimeout(() => {
            if (!window.keepStatusVisible) {
                statusDiv.classList.add('hidden');
                document.getElementById('password').value = '';
                updateProgress(0);
            }
        }, 4000);
    }
});

async function encryptFile(file, password, outStream) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    
    await outStream.write(salt);
    
    // 1. Encrypt and write the original filename
    const encoder = new TextEncoder();
    const filenameBytes = encoder.encode(file.name);
    
    const headerIv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedFilenameBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: headerIv },
        key,
        filenameBytes
    );
    const encryptedFilename = new Uint8Array(encryptedFilenameBuffer);
    
    await outStream.write(headerIv);
    
    const lenBuffer = new ArrayBuffer(2);
    new DataView(lenBuffer).setUint16(0, encryptedFilename.length, false);
    await outStream.write(new Uint8Array(lenBuffer));
    
    await outStream.write(encryptedFilename);
    
    // 2. Encrypt the file data in chunks
    let offset = 0;
    while (offset < file.size) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const arrayBuffer = await chunk.arrayBuffer();
        
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            arrayBuffer
        );
        
        await outStream.write(iv);
        await outStream.write(new Uint8Array(encrypted));
        
        offset += CHUNK_SIZE;
        updateProgress((offset / file.size) * 100);
    }
}

async function decryptFile(file, key, dataOffset, outStream) {
    let offset = dataOffset;
    
    while (offset < file.size) {
        const ivBlob = file.slice(offset, offset + 12);
        const iv = new Uint8Array(await ivBlob.arrayBuffer());
        offset += 12;
        
        let chunkSizeToRead = CHUNK_SIZE + 16;
        if (offset + chunkSizeToRead > file.size) {
            chunkSizeToRead = file.size - offset;
        }
        
        const chunkBlob = file.slice(offset, offset + chunkSizeToRead);
        const chunkBuffer = await chunkBlob.arrayBuffer();
        
        try {
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                chunkBuffer
            );
            await outStream.write(new Uint8Array(decrypted));
        } catch (e) {
            throw new Error("Decryption failed on a chunk! File corrupted.");
        }
        
        offset += chunkSizeToRead;
        updateProgress((offset / file.size) * 100);
    }
}
