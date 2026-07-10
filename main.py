import os
import string
import random
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Secure Media Vault (E2E + Cloud)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Config
supabase: Client = None
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
if url and key:
    supabase = create_client(url, key)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return RedirectResponse(url="/static/index.html")

def generate_short_id():
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(6))

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase integration is not configured. Please set API keys in .env")
    
    short_id = generate_short_id()
    file_path = f"{short_id}.enc"
    
    # Read the file data and upload directly to Supabase Storage
    try:
        file_data = await file.read()
        supabase.storage.from_("vault").upload(
            path=file_path,
            file=file_data,
            file_options={"content-type": "application/octet-stream"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")
    
    # Save mapping to Supabase Database
    try:
        supabase.table("files").insert({"id": short_id, "s3_key": file_path}).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    return {"id": short_id, "link": f"/download/{short_id}"}

@app.get("/download/{file_id}")
def download_file(file_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase integration is not configured.")
        
    # Get file path from DB
    try:
        response = supabase.table("files").select("s3_key").eq("id", file_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="File not found in database.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    file_path = response.data[0]["s3_key"]
    
    # Generate public download URL from Supabase Storage
    public_url = supabase.storage.from_("vault").get_public_url(file_path)
    
    # Redirect the user's browser directly to the Supabase CDN
    return RedirectResponse(url=public_url)
