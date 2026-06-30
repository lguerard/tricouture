"""Tricouture Whisper service (GPU) — hands-free voice transcription.

POST /transcribe (audio) -> { text }
Used for the voice row counter: the app sends a short audio clip and receives
the transcribed text; the app interprets commands ("next row", "plus one", a number...).
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
        # "small": good speed/quality trade-off for short voice commands.
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
