"""Tricouture Vision service (GPU).

Endpoints:
- GET  /health            : status + GPU availability
- POST /ocr               : OCR a yarn label -> text + guessed fields
- POST /gauge             : (heuristic) gauge estimation from a photo
- POST /embed-image       : image embedding (color/texture) for photo search

OCR via EasyOCR (uses GPU if available). Label parsing is best-effort:
returns raw text + guessed fields; the app lets the user correct them.
"""
import io
import re
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI(title="Tricouture Vision")

_reader = None


def get_reader():
    """Load EasyOCR lazily (keeps the model in memory)."""
    global _reader
    if _reader is None:
        import easyocr  # late import for fast startup
        import torch
        _reader = easyocr.Reader(["fr", "en"], gpu=torch.cuda.is_available())
    return _reader


def gpu_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


WEIGHTS = ["lace", "fingering", "sport", "dk", "worsted", "aran", "bulky", "super bulky"]


def guess_fields(text: str) -> dict:
    """Guess brand/fiber/weight/yardage from OCR label text."""
    low = text.lower()
    fields: dict = {}

    m = re.search(r"(\d{2,4})\s?(m|meters|mètres|metres)\b", low)
    if m:
        fields["yardsPerSkein"] = int(m.group(1))
    m = re.search(r"(\d{2,3})\s?(g|grammes|grams)\b", low)
    if m:
        fields["gramsPerSkein"] = int(m.group(1))
    for w in WEIGHTS:
        if w in low:
            fields["weightCategory"] = w.replace(" ", "-")
            break
    m = re.search(r"(\d{1,3})\s?%\s?([a-zàâéèêëîïôûüç ]+)", low)
    if m:
        fields["fiber"] = f"{m.group(1)}% {m.group(2).strip()}"
    return fields


@app.get("/health")
def health():
    return {"status": "ok", "gpu": gpu_available()}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    data = await file.read()
    try:
        lines = get_reader().readtext(data, detail=0, paragraph=True)
    except Exception as e:  # pragma: no cover
        return JSONResponse({"error": f"OCR unavailable: {e}"}, status_code=503)
    text = "\n".join(lines)
    return {"text": text, "fields": guess_fields(text)}


@app.post("/gauge")
async def gauge(file: UploadFile = File(...)):
    # Automatic stitch/row counting requires a dedicated model (to be trained).
    # Placeholder: returns an explicit response so the app can display it.
    await file.read()
    return JSONResponse(
        {"error": "Gauge estimation not yet available (model coming soon)."},
        status_code=501,
    )


@app.post("/embed-image")
async def embed_image(file: UploadFile = File(...)):
    """Image embedding via OpenCLIP if available, otherwise 501."""
    data = await file.read()
    try:
        import torch, open_clip
        from PIL import Image
        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="laion2b_s34b_b79k"
        )
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.to(device).eval()
        img = preprocess(Image.open(io.BytesIO(data)).convert("RGB")).unsqueeze(0).to(device)
        with torch.no_grad():
            vec = model.encode_image(img)[0].cpu().tolist()
        return {"embedding": vec}
    except ImportError:
        return JSONResponse({"error": "open_clip not installed"}, status_code=501)
    except Exception as e:  # pragma: no cover
        return JSONResponse({"error": str(e)}, status_code=500)
