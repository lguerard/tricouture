"""Service vision Tricouture (GPU).

Endpoints :
- GET  /health            : statut + disponibilité GPU
- POST /ocr               : OCR d'une étiquette de pelote -> texte + champs devinés
- POST /gauge             : (heuristique) estimation d'échantillon depuis une photo
- POST /embed-image       : embedding image (couleur/texture) pour recherche par photo

OCR via EasyOCR (utilise le GPU s'il est dispo). Le parsing d'étiquette est best-effort :
il renvoie le texte brut + des champs devinés ; l'app laisse l'utilisateur corriger.
"""
import io
import re
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI(title="Tricouture Vision")

_reader = None


def get_reader():
    """Charge EasyOCR paresseusement (et garde le modèle en mémoire)."""
    global _reader
    if _reader is None:
        import easyocr  # import tardif : démarrage rapide
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
    """Devine marque/fibre/poids/métrage depuis le texte OCR d'une étiquette."""
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
        return JSONResponse({"error": f"OCR indisponible: {e}"}, status_code=503)
    text = "\n".join(lines)
    return {"text": text, "fields": guess_fields(text)}


@app.post("/gauge")
async def gauge(file: UploadFile = File(...)):
    # Le comptage automatique de mailles/rangs nécessite un modèle dédié (à entraîner).
    # Placeholder : renvoie une réponse explicite pour que l'app le signale.
    await file.read()
    return JSONResponse(
        {"error": "Estimation d'échantillon non encore disponible (modèle à venir)."},
        status_code=501,
    )


@app.post("/embed-image")
async def embed_image(file: UploadFile = File(...)):
    """Embedding image via OpenCLIP si présent, sinon 501."""
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
        return JSONResponse({"error": "open_clip non installé"}, status_code=501)
    except Exception as e:  # pragma: no cover
        return JSONResponse({"error": str(e)}, status_code=500)
