"""Tricouture Whisper service (GPU) — hands-free voice transcription.

POST /transcribe (audio) -> { text }
GET  /health             -> status (never loads the model)

Used for the voice row counter: the app sends a short (~3 s) audio clip and
receives the transcribed text; the app interprets commands ("rang suivant",
"plus un"... see app/src/routes/projects/[id]/+page.svelte).

GPU etiquette (the card is shared with an LLM and other services): the model
is loaded on the first request only, and unloaded again after
WHISPER_IDLE_UNLOAD_SECONDS without a request (default 300; 0 = keep loaded),
giving its ~1-1.5 GB of VRAM back.

Environment variables:
  WHISPER_MODEL                model name/path (default: large-v3-turbo)
  WHISPER_DEVICE               auto | cuda | cpu (default: auto)
  WHISPER_COMPUTE_TYPE         default: int8_float16 on CUDA, int8 on CPU
  WHISPER_IDLE_UNLOAD_SECONDS  idle time before unloading (default: 300)
  WHISPER_LANGUAGE             default: fr
  WHISPER_INITIAL_PROMPT       vocabulary hint (default: the row-counter commands)
"""
import asyncio
import gc
import logging
import os
import tempfile
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

log = logging.getLogger("uvicorn.error")

MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
IDLE_UNLOAD_SECONDS = float(os.environ.get("WHISPER_IDLE_UNLOAD_SECONDS", "300") or 0)
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "fr")
# The words the row counter listens for. A short prompt in the same style
# biases decoding toward them ("rang" rather than "rends", "plus un" rather
# than "plus tôt") without making Whisper hallucinate them on silence -- the
# VAD filter drops silent clips before decoding.
INITIAL_PROMPT = os.environ.get(
    "WHISPER_INITIAL_PROMPT",
    "Rang suivant. Plus un. Suivant. Rang. Incrémente. Un.",
)

_lock = threading.Lock()
_model = None
_in_use = 0
_last_used = 0.0


def _device() -> str:
    wanted = os.environ.get("WHISPER_DEVICE", "auto")
    if wanted != "auto":
        return wanted
    try:
        import ctranslate2  # no CUDA context created, unlike torch

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


def _load():
    from faster_whisper import WhisperModel  # late import: fast startup

    device = _device()
    compute = os.environ.get("WHISPER_COMPUTE_TYPE") or ("int8_float16" if device == "cuda" else "int8")
    started = time.monotonic()
    model = WhisperModel(MODEL_NAME, device=device, compute_type=compute)
    log.info("whisper: loaded %s on %s (%s) in %.1fs", MODEL_NAME, device, compute, time.monotonic() - started)
    return model


def _acquire():
    global _model, _in_use
    with _lock:
        if _model is None:
            _model = _load()
        _in_use += 1
        return _model


def _release():
    global _in_use, _last_used
    with _lock:
        _in_use -= 1
        _last_used = time.monotonic()


def _unload_if_idle() -> None:
    """Drops the model once idle long enough; frees its VRAM."""
    global _model
    with _lock:
        if _model is None or _in_use or IDLE_UNLOAD_SECONDS <= 0:
            return
        if time.monotonic() - _last_used < IDLE_UNLOAD_SECONDS:
            return
        model, _model = _model, None
    try:
        # Releases the CTranslate2 weights right away rather than whenever
        # the object happens to be collected.
        model.model.unload_model()
    except Exception:
        pass
    del model
    gc.collect()
    log.info("whisper: model unloaded after %.0fs idle", IDLE_UNLOAD_SECONDS)


async def _idle_watcher():
    interval = max(5.0, min(30.0, IDLE_UNLOAD_SECONDS / 2))
    while True:
        await asyncio.sleep(interval)
        await run_in_threadpool(_unload_if_idle)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_idle_watcher()) if IDLE_UNLOAD_SECONDS > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Tricouture Whisper", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "loaded": _model is not None}


def _transcribe(path: str) -> str:
    model = _acquire()
    try:
        segments, _ = model.transcribe(
            path,
            language=LANGUAGE,
            beam_size=1,
            vad_filter=True,
            initial_prompt=INITIAL_PROMPT or None,
            condition_on_previous_text=False,
        )
        return " ".join(s.text for s in segments).strip()
    finally:
        _release()


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read()
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        # Off the event loop: /health stays responsive while decoding (and
        # during the first request's model load).
        return {"text": await run_in_threadpool(_transcribe, path)}
    except Exception as e:  # pragma: no cover
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        os.unlink(path)
