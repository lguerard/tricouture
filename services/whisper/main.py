"""Service Whisper Tricouture (GPU) — transcription vocale mains-libres.

POST /transcribe (audio) -> { text }
Sert au compteur de rangs vocal : l'app envoie un court extrait audio, on renvoie
le texte ; l'app interprète des commandes ("rang suivant", "plus un", un nombre…).
"""
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import tempfile
import os

app = FastAPI(title="Tricouture Whisper")

_model = None


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute = "float16" if device == "cuda" else "int8"
        # "small" : bon compromis vitesse/qualité pour des commandes courtes en français.
        _model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device=device, compute_type=compute)
    return _model


@app.get("/health")
def health():
    try:
        import torch
        return {"status": "ok", "gpu": torch.cuda.is_available()}
    except Exception:
        return {"status": "ok", "gpu": False}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read()
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        segments, _ = get_model().transcribe(path, language="fr", beam_size=1)
        text = " ".join(s.text for s in segments).strip()
        return {"text": text}
    except Exception as e:  # pragma: no cover
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        os.unlink(path)
