# Development Journey: Secure Media Vault

Building this platform was an iterative process of solving complex performance, security, and architectural challenges. This document serves as a post-mortem and development log of the phases we went through to reach the final product.

---

## Phase 1: The Initial Python Backend
* **Goal:** Build a basic local application to encrypt and decrypt files using a password.
* **Implementation:** We set up a basic FastAPI backend utilizing Python's `cryptography` library to handle file encryption on the server.
* **Problem Faced:** *Memory Exhaustion.* When attempting to encrypt a large 1GB video file, the server attempted to load the entire file into RAM, instantly crashing the application.
* **Solution:** We rewrote the Python cryptography logic to use a **chunked streaming generator**, reading and encrypting the file in tiny blocks to maintain O(1) memory usage regardless of file size.

## Phase 2: The E2EE (End-to-End Encryption) Pivot
* **Goal:** Upgrade to a true Zero-Knowledge Architecture. The server should never have access to the raw unencrypted files or the user's password.
* **Implementation:** We completely ripped out the Python encryption logic and moved it to the frontend utilizing JavaScript and the native **WebCrypto API**.
* **Problem Faced:** *Browser Crashes.* Standard HTML file downloads require holding the entire generated file in RAM (as a Blob). When encrypting a large video in the browser, the browser tab would run out of memory and crash.
* **Solution:** We implemented the modern **File System Access API**. This allowed our JavaScript to stream the encrypted chunks directly to the user's physical hard drive in real-time, completely bypassing browser RAM limitations.
* **Problem Faced:** Safari and Firefox do not currently support the File System Access API.
* **Solution:** We built a graceful fallback `MemoryStream` mechanism that automatically detects browser capabilities and defaults to standard Blob-based downloads for unsupported browsers.

## Phase 3: Metadata Preservation
* **Goal:** Ensure the decrypted file automatically restores its original filename and extension (e.g., `vacation.mp4`) rather than forcing the user to guess it.
* **Problem Faced:** We could not simply attach the original filename in plaintext to the file, as that violates Zero-Knowledge principles (metadata leakage).
* **Solution:** We designed a custom binary header format. The JavaScript now securely encrypts the original filename with AES-GCM and prepends the ciphertext and length to the very beginning of the `.enc` file. During decryption, the system parses the binary header, decrypts the true filename first, and automatically prompts the save dialog with the perfect original extension.

## Phase 4: Cloud Storage & Shareable Links
* **Goal:** Allow users to upload their encrypted vaults to the cloud and generate a secure, shareable download link (like Google Drive).
* **Implementation:** We integrated **Supabase** (PostgreSQL + S3-Compatible Storage). The FastAPI server acts as a routing layer to map 6-character shortlinks to cloud storage keys.
* **Problem Faced:** *Row Level Security (RLS).* Supabase heavily guards its storage buckets. Our initial uploads were blocked with HTTP 403 Unauthorized errors due to RLS policies.
* **Solution:** We configured the Python backend with a trusted `service_role` secret key, granting it secure administrative bypass privileges over the database.
* **Problem Faced:** *Bandwidth Bottlenecks.* Downloading massive multi-gigabyte files *through* our Python server would be incredibly slow and rack up massive bandwidth costs.
* **Solution:** We implemented **Pre-Signed Redirects**. When a user visits the shortlink, the FastAPI server securely requests a direct CDN link from Supabase, and issues an HTTP 307 Redirect to the user's browser. The browser instantly downloads the file directly from Supabase's high-speed global servers, utilizing exactly zero bandwidth on our Python backend.

## Phase 5: Deployment & CI/CD
* **Goal:** Deploy the application to the public internet using Render.com.
* **Problem Faced:** *Health Check Failures.* Render's automated deployment ping sends a `HEAD /` request to check if the server is alive. Because our root endpoint was issuing a 307 Redirect, Render threw a `405 Method Not Allowed` error and halted the deployment.
* **Solution:** We added an explicit `@app.head("/")` route returning a `200 OK` JSON response, instantly satisfying the health checker and allowing the deployment to go live.
* **Problem Faced:** *Secret Leakage.* We accidentally attempted to commit our `.env` file containing the Supabase database secrets.
* **Solution:** GitHub's Advanced Security Secret Scanner caught the key and blocked the push. We implemented a robust `.gitignore`, purged the Git cache of the `.env` file, amended our commits, and pushed a clean, highly secure repository.
