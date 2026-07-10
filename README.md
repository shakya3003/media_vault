# Secure Media Vault 🔒

A military-grade, Zero-Knowledge End-to-End Encryption (E2EE) platform designed for securely storing and sharing large files. 

## 🌟 Features
* **Zero-Knowledge Architecture:** Files are encrypted and decrypted entirely on the client-side (in the browser) using the WebCrypto API (AES-GCM 256-bit). The server *never* sees your unencrypted files or your passwords.
* **Large File Streaming:** Utilizes the modern File System Access API to stream encryption directly to disk, allowing the platform to encrypt massive multi-gigabyte files (like 4K videos) without crashing the browser's RAM.
* **Cloud Sync & Shareable Links:** Optionally upload your encrypted blobs directly to a Supabase Cloud bucket. The server generates secure, shareable download links for easy file sharing.
* **Metadata Protection:** The original filename and extension are strictly encrypted and embedded directly into the binary header of the `.enc` file, preventing data leaks.
* **Pre-Signed Redirects:** Downloads route through a FastAPI backend which redirects instantly to a high-speed CDN, offloading bandwidth from the Python server.

## 💻 Tech Stack
* **Frontend:** Vanilla JavaScript, HTML5, CSS3, WebCrypto API
* **Backend:** Python, FastAPI, Uvicorn
* **Database & Storage:** Supabase (PostgreSQL + S3-Compatible Object Storage)
* **Deployment:** Docker

## 🚀 Local Setup

**1. Clone the repository**
```bash
git clone https://github.com/shakya3003/media_vault.git
cd media_vault
```

**2. Install Dependencies**
```bash
python -m pip install -r requirements.txt
```

**3. Configure Environment Variables**
Create a `.env` file in the root directory (use `.env.example` as a template) and add your Supabase credentials:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-service-role-secret-key
```

**4. Run the Server**
```bash
python -m uvicorn main:app --reload
```
Open your browser and navigate to `http://127.0.0.1:8000`.

## 🔒 Cryptography Details
The platform uses PBKDF2 (with 100,000 iterations of SHA-256) to securely derive a 256-bit AES key from the user's password and a randomized 16-byte salt. The file is then chunked into 5MB blocks, where every single block receives its own unique 12-byte Initialization Vector (IV) and is encrypted using AES-GCM, embedding a 16-byte authentication tag per chunk to guarantee absolute data integrity and prevent tampering.
