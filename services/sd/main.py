"""Service Stable Diffusion Tricouture — aperçu coloris.

Endpoint :
  POST /preview   Génère un aperçu du vêtement/laine dans le coloris choisi.
  GET  /health    Statut du service + disponibilité GPU.

Variables d'environnement :
  SD_MODEL_ID   ID HuggingFace du modèle (défaut: stabilityai/stable-diffusion-2-1)
  HF_TOKEN      Token HuggingFace (optionnel, pour les modèles privés)
"""
import base64
import io
import os
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="Tricouture SD")

MODEL_ID = os.getenv("SD_MODEL_ID", "stabilityai/stable-diffusion-2-1-base")
HF_TOKEN = os.getenv("HF_TOKEN")

_pipe = None
_pipe_img2img = None


def _load_txt2img():
    global _pipe
    if _pipe is not None:
        return _pipe
    from diffusers import StableDiffusionPipeline
    _pipe = StableDiffusionPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        token=HF_TOKEN,
        safety_checker=None,
    )
    if torch.cuda.is_available():
        _pipe = _pipe.to("cuda")
        _pipe.enable_attention_slicing()
    return _pipe


def _load_img2img():
    global _pipe_img2img
    if _pipe_img2img is not None:
        return _pipe_img2img
    from diffusers import StableDiffusionImg2ImgPipeline
    _pipe_img2img = StableDiffusionImg2ImgPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        token=HF_TOKEN,
        safety_checker=None,
    )
    if torch.cuda.is_available():
        _pipe_img2img = _pipe_img2img.to("cuda")
        _pipe_img2img.enable_attention_slicing()
    return _pipe_img2img


def _hex_to_name(hex_color: str) -> str:
    """Convertit une couleur hex en description textuelle approximative."""
    h = hex_color.lstrip('#')
    if len(h) != 6:
        return "coloré"
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    # Classification grossière (hue-based)
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx - mn < 30:
        if mx < 50:
            return "noir"
        if mx > 200:
            return "blanc"
        return "gris"
    if r >= g and r >= b:
        return "rouge vif" if r > 180 else "bordeaux"
    if g >= r and g >= b:
        return "vert" if g > 150 else "kaki"
    if b >= r and b >= g:
        return "bleu" if b > 150 else "marine"
    if r > 150 and g > 150 and b < 80:
        return "jaune"
    if r > 150 and b > 100 and g < 80:
        return "violet"
    return "coloré"


class PreviewRequest(BaseModel):
    prompt: str = ""
    color_hex: str = "#888888"
    image_base64: Optional[str] = None
    strength: float = 0.65
    steps: int = 25
    guidance: float = 7.5


@app.get("/health")
def health():
    return {
        "status": "ok",
        "gpu": torch.cuda.is_available(),
        "model": MODEL_ID,
        "device": str(torch.cuda.get_device_name(0)) if torch.cuda.is_available() else "cpu",
    }


@app.post("/preview")
def preview(req: PreviewRequest):
    color_name = _hex_to_name(req.color_hex)
    base_prompt = req.prompt.strip() or "pelote de laine, textile, vêtement"
    full_prompt = (
        f"{base_prompt}, coloris {color_name}, couleur {req.color_hex}, "
        "photographie produit, haute qualité, fond blanc"
    )
    neg_prompt = "flou, mauvaise qualité, texte, watermark, dessin animé"

    try:
        if req.image_base64:
            # img2img : recolorie l'image de référence.
            img_bytes = base64.b64decode(req.image_base64)
            ref_img = Image.open(io.BytesIO(img_bytes)).convert("RGB").resize((512, 512))
            pipe = _load_img2img()
            result = pipe(
                prompt=full_prompt,
                negative_prompt=neg_prompt,
                image=ref_img,
                strength=min(max(req.strength, 0.3), 0.95),
                num_inference_steps=req.steps,
                guidance_scale=req.guidance,
            )
        else:
            # txt2img : génère de zéro.
            pipe = _load_txt2img()
            result = pipe(
                prompt=full_prompt,
                negative_prompt=neg_prompt,
                num_inference_steps=req.steps,
                guidance_scale=req.guidance,
                width=512,
                height=512,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    out_img = result.images[0]
    buf = io.BytesIO()
    out_img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode()
    return JSONResponse({"image_base64": encoded, "format": "png", "prompt": full_prompt})
