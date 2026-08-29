"""Tricouture Vision service (GPU).

Endpoints:
- GET  /health            : status + GPU availability
- POST /ocr               : OCR a yarn label -> text + guessed fields
- POST /analyze-photo     : dominant color + motif (zero-shot CLIP) from a stash photo
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

# Zero-shot motif prompts for CLIP — codes match app's lib/labels.ts MOTIF_VALUES.
MOTIF_PROMPTS = {
    "solid": "a photo of a solid plain color fabric or yarn with no pattern",
    "stripes": "a photo of striped fabric or yarn",
    "floral": "a photo of a floral flower print fabric",
    "dots": "a photo of a polka dot pattern fabric",
    "chevron": "a photo of a chevron zigzag pattern fabric",
    "plaid": "a photo of a plaid tartan checkered fabric",
    "jacquard": "a photo of a jacquard textured knit pattern",
    "animal": "a photo of an animal print pattern like leopard or zebra",
    "geometric": "a photo of a geometric pattern fabric",
    "print": "a photo of a printed graphic pattern fabric",
}

_clip = None  # (model, preprocess, tokenizer, device) once loaded; False if unavailable


def get_clip():
    """Loads OpenCLIP lazily (optional dependency, see requirements.txt)."""
    global _clip
    if _clip is False:
        return None
    if _clip is None:
        try:
            import torch
            import open_clip
            device = "cuda" if torch.cuda.is_available() else "cpu"
            model, _, preprocess = open_clip.create_model_and_transforms(
                "ViT-B-32", pretrained="laion2b_s34b_b79k"
            )
            tokenizer = open_clip.get_tokenizer("ViT-B-32")
            _clip = (model.to(device).eval(), preprocess, tokenizer, device)
        except ImportError:
            _clip = False
            return None
    return _clip


def dominant_color_hex(data: bytes) -> str:
    """Average color of the center crop (avoids white product-photo margins)."""
    from PIL import Image
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    cropped = img.crop((int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8)))
    r, g, b = cropped.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def classify_motif(data: bytes) -> str | None:
    """Zero-shot motif classification via CLIP image/text similarity."""
    clip = get_clip()
    if clip is None:
        return None
    import torch
    from PIL import Image
    model, preprocess, tokenizer, device = clip
    labels = list(MOTIF_PROMPTS.keys())
    image = preprocess(Image.open(io.BytesIO(data)).convert("RGB")).unsqueeze(0).to(device)
    texts = tokenizer([MOTIF_PROMPTS[label] for label in labels]).to(device)
    with torch.no_grad():
        image_features = model.encode_image(image)
        text_features = model.encode_text(texts)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        text_features /= text_features.norm(dim=-1, keepdim=True)
        similarities = (image_features @ text_features.T)[0]
    return labels[int(similarities.argmax())]


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


@app.post("/analyze-photo")
async def analyze_photo(file: UploadFile = File(...)):
    """Guesses colorHex (always) and motif (if OpenCLIP is installed) from a stash photo."""
    data = await file.read()
    try:
        color_hex = dominant_color_hex(data)
    except Exception as e:  # pragma: no cover
        return JSONResponse({"error": f"Analysis unavailable: {e}"}, status_code=503)
    try:
        motif = classify_motif(data)
    except Exception:
        motif = None
    return {"colorHex": color_hex, "motif": motif}


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
