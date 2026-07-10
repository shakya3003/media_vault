# Secure Media Vault

**Live Demo:** [https://aryan-vault.onrender.com/](https://aryan-vault.onrender.com/)

## Overview
Secure Media Vault is a highly secure, Zero-Knowledge End-to-End Encryption (E2EE) platform designed for storing and sharing large binary files, including high-resolution video and audio. The application guarantees that files are encrypted client-side before transmission, ensuring that the server infrastructure remains entirely agnostic to the plaintext contents and user passwords.

## Architecture

### Frontend
The frontend is built using standard HTML5, CSS3, and Vanilla JavaScript. It leverages the native WebCrypto API to perform hardware-accelerated cryptographic operations directly within the user's browser context. 
To handle multi-gigabyte files without exhausting browser memory, the frontend utilizes the File System Access API to stream data directly to and from the local disk in discrete chunks.

### Backend
The backend API is powered by Python and FastAPI, running on an ASGI Uvicorn server. The backend acts strictly as a secure routing layer and mapping service. It provides a RESTful interface for handling chunked encrypted streams and generating shareable download links via temporary redirects.

### Database & Cloud Storage
The platform integrates with Supabase for persistent cloud infrastructure:
- **Database (PostgreSQL):** Stores the mapping between the generated short-links and the absolute storage paths.
- **Storage (S3-Compatible Object Storage):** Stores the encrypted blobs. Downloads are facilitated via pre-signed public URLs, allowing the backend to redirect client requests directly to the global CDN, bypassing backend bandwidth bottlenecks.

## Cryptographic Protocol

### 1. Key Derivation
Upon initialization, the system generates a cryptographically secure 16-byte random salt. The user's plaintext password and the salt are passed through the PBKDF2 (Password-Based Key Derivation Function 2) algorithm, utilizing the SHA-256 hash function with 100,000 iterations. This yields a deterministic 256-bit symmetric encryption key.

### 2. Metadata Protection
To prevent metadata leakage, the original filename and extension are encrypted prior to file processing. A unique 12-byte Initialization Vector (IV) is generated, and the filename is encrypted using AES-GCM. The plaintext length of the filename, the IV, and the resulting ciphertext are prepended to the binary header of the final output file.

### 3. Chunking & Streaming Encryption
The target file is read in 5MB sequential chunks. For each chunk:
- A new, cryptographically secure 12-byte IV is generated.
- The chunk is encrypted using AES-256-GCM (Galois/Counter Mode).
- AES-GCM appends a 16-byte Authentication Tag to the ciphertext to ensure data integrity and detect tampering.
- The IV and the corresponding ciphertext block are written sequentially to the output stream.

This streaming architecture ensures O(1) memory complexity regardless of the total file size.

## Local Setup & Deployment

### Prerequisites
- Python 3.11+
- Docker (optional, for containerized deployment)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/shakya3003/media_vault.git
cd media_vault
```

2. Install backend dependencies:
```bash
python -m pip install -r requirements.txt
```

3. Configure Environment Variables:
Create a `.env` file in the root directory and populate it with your Supabase credentials:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-service-role-secret-key
```

4. Initialize the Server:
```bash
python -m uvicorn main:app --reload
```
The application will be accessible at `http://127.0.0.1:8000`.

### Docker Deployment
The application includes a `Dockerfile` for standardized deployment environments (e.g., Render, AWS ECS, Google Cloud Run). 
```bash
docker build -t media-vault .
docker run -p 8000:8000 --env-file .env media-vault
```
